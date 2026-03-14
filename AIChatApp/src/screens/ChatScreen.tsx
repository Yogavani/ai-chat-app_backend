import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { RootStackParamList } from "../navigation/navigation";
import { RouteProp } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  socket,
  ensureSocketConnection
} from "../services/socket";
import API from "../services/api";
import { useRef } from "react";

type ChatScreenRouteProp = RouteProp<RootStackParamList, "Chat">;

type Props = {
  route: ChatScreenRouteProp;
};

type Message = {
  id: number;
  sender_id: number;
  receiver_id: number;
  message: string;
  created_at?: string;
  client_created_at?: number;
};

const dedupeMessages = (items: Message[]) => {
  const seen = new Set<number>();
  const result: Message[] = [];

  for (const item of items) {
    if (typeof item?.id !== "number") continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }

  return result;
};

const getMessageDate = (message: Message) => {
  const rawValue = message.created_at ?? message.client_created_at;
  if (!rawValue) return new Date();

  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
};

const getDayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDateLabel = (date: Date) => {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (targetStart.getTime() === todayStart.getTime()) return "Today";
  if (targetStart.getTime() === yesterdayStart.getTime()) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
};

const ChatScreen = ({ route }: Props) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [senderId, setSenderId] = useState<number | null>(null);
  const { receiverId, receiverName } = route.params;
  const flatListRef = useRef<FlatList>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    loadSenderId();
  }, []);

  useEffect(() => {
    if (senderId !== null) {
      fetchMessages();
    }
  }, [senderId, receiverId]);

  useEffect(() => {
    if (messages.length === 0) return;

    const timer = setTimeout(() => {
      if (shouldAutoScrollRef.current) {
        flatListRef.current?.scrollToEnd({ animated: true });
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [messages.length]);

  useEffect(() => {
    if (!senderId) return;

    const onConnect = () => {
      console.log("SOCKET CONNECTED:", socket.id);
      socket.emit("join", senderId);
      console.log("JOINING ROOM:", senderId);
    };

    const onConnectError = (err: any) => {
      console.log("SOCKET CONNECT ERROR:", err?.message || err);
    };

    const onNewMessage = (msg: Message | any) => {
      console.log("SOCKET MESSAGE RECEIVED:", msg);

      if (
        !msg ||
        typeof msg !== "object" ||
        typeof msg.sender_id !== "number" ||
        typeof msg.receiver_id !== "number"
      ) {
        fetchMessages();
        return;
      }

      const isCurrentChatMessage =
        (msg.sender_id === senderId && msg.receiver_id === receiverId) ||
        (msg.sender_id === receiverId && msg.receiver_id === senderId);

      if (!isCurrentChatMessage) return;

      setMessages((prev) => {
        return dedupeMessages([
          ...prev,
          { ...msg, client_created_at: Date.now() }
        ]);
      });
    };

    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    socket.on("new-message", onNewMessage);

    if (socket.connected) {
      onConnect();
    } else {
      ensureSocketConnection();
    }
  
    return () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.off("new-message", onNewMessage);
    };
  }, [senderId, receiverId]);

  const loadSenderId = async () => {
    try {
      const savedUserId = await AsyncStorage.getItem("userId");
      if (!savedUserId) {
        console.log("No userId found in AsyncStorage");
        return;
      }

      const parsedUserId = Number(savedUserId);
      if (Number.isNaN(parsedUserId)) {
        console.log("Stored userId is invalid");
        return;
      }

      setSenderId(parsedUserId);
    } catch (error) {
      console.log("Load sender id error:", error);
    }
  };
  
  const fetchMessages = async () => {
    if (senderId === null) return;
  
    try {
      const response = await API.get(
        `/receive-message/${senderId}/${receiverId}`
      );
      console.log("MESSAGES fetchMessages:", response.data);
      const normalizedMessages: Message[] = (response.data || []).map(
        (item: Message) => ({
          ...item,
          client_created_at: item.client_created_at ?? Date.now()
        })
      );
      setMessages(dedupeMessages(normalizedMessages));
    } catch (error) {
      console.log("Fetch messages error:", error);
    }
  };
  const sendMessage = async () => {
    if (senderId === null) return;
    if (!text.trim()) return;
  
    try {
      const response = await API.post("/send-message", {
        sender_id: senderId,
        receiver_id: receiverId,
        message: text,
      });
      console.log("NEW MESSAGESSS:", response.data);
      const newMessage = {
        ...response.data,
        client_created_at: Date.now()
      };
      setMessages((prev) => dedupeMessages([...prev, newMessage]));
      setText("");
    } catch (error) {
      console.log("Send message error:", error);
    }
  };

  const messagesWithDate = useMemo(() => {
    return messages.map((item, index) => {
      const currentDate = getMessageDate(item);
      const previousDate =
        index > 0 ? getMessageDate(messages[index - 1]) : null;
      const showDateHeader =
        !previousDate || getDayKey(currentDate) !== getDayKey(previousDate);

      return {
        ...item,
        showDateHeader,
        dateLabel: getDateLabel(currentDate)
      };
    });
  }, [messages]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{receiverName}</Text>
      </View>

      <View style={styles.chatBody}>
        <FlatList
          ref={flatListRef}
          data={messagesWithDate}
          keyExtractor={(item, index) =>
            typeof item.id === "number"
              ? `message-${item.id}`
              : `message-fallback-${index}`
          }
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => {
            if (shouldAutoScrollRef.current) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
          onScroll={(event) => {
            const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
            const distanceFromBottom =
              contentSize.height - (layoutMeasurement.height + contentOffset.y);
            shouldAutoScrollRef.current = distanceFromBottom < 80;
          }}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <>
              {item.showDateHeader ? (
                <View style={styles.dateChip}>
                  <Text style={styles.dateChipText}>{item.dateLabel}</Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.messageBubble,
                  item.sender_id === senderId
                    ? styles.myMessageBubble
                    : styles.theirMessageBubble
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    item.sender_id === senderId
                      ? styles.myMessageText
                      : styles.theirMessageText
                  ]}
                >
                  {item.message}
                </Text>
              </View>
            </>
          )}
        />
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor="#9ca3af"
        />

        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

export default ChatScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#ffffff"
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827"
  },
  chatBody: {
    flex: 1,
    backgroundColor: "#f3f4f6"
  },
  messagesContent: {
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  dateChip: {
    alignSelf: "center",
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 8,
    marginBottom: 4
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151"
  },
  messageBubble: {
    maxWidth: "78%",
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginVertical: 4,
    borderRadius: 14
  },
  myMessageBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#2563eb",
    borderBottomRightRadius: 6
  },
  theirMessageBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 6
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20
  },
  myMessageText: {
    color: "#ffffff"
  },
  theirMessageText: {
    color: "#111827"
  },
  emptyText: {
    textAlign: "center",
    color: "#6b7280",
    marginTop: 24
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#ffffff"
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#f9fafb",
    marginRight: 8
  },
  sendButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20
  },
  sendButtonText: {
    color: "#ffffff",
    fontWeight: "600"
  }
});
