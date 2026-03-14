import { io } from "socket.io-client";

const SOCKET_URL = "http://192.168.13.42:5000";

export const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  autoConnect: false
});

export const ensureSocketConnection = () => {
  if (!socket.connected) {
    socket.connect();
  }
};
