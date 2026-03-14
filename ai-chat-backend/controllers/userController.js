const userService = require("../services/userService");

exports.getUsers = async (request, reply) => {
  try {
    const users = await userService.getUsers();
    return users;
  } catch (error) {
    reply.code(500).send(error);
  }
};

exports.registerUser = async (request, reply) => {
    try {
      const user = await userService.registerUser(request.body);
      return user;
    } catch (error) {
      reply.code(500).send(error);
    }
  };

  exports.loginUser = async (request, reply) => {

    console.log("LOGIN HIT");
    console.log("BODY:", request.body);
  
    try {
  
      const result = await userService.loginUser(request.body);
  
      console.log("SERVICE RESULT:", result);
  
      reply.send(result);
  
    } catch (error) {
  
      console.log("LOGIN ERROR:", error);
  
      reply.code(400).send(error);
  
    }
  };

  exports.sendMessage = async (req, reply) => {
    try {
      const data = req.body;
      console.log("sendMessagesendMessage", data);
  
      const result = await userService.sendMessage(data);
  
      const newMessage = {
        id: result.insertId || result.messageId,
        sender_id: data.sender_id,
        receiver_id: data.receiver_id,
        message: data.message
      };
      const room = String(data.receiver_id);
      const members = req.server.io.sockets.adapter.rooms.get(room);
      console.log("room members", room, members ? [...members] : []);
      console.log("emit io namespace:", req.server.io.of("/").name);
      
      if (req.server && req.server.io && data.receiver_id) {
        console.log("EMITTING MESSAGE TO ROOM:", data.receiver_id);
        req.server.io.to(String(data.receiver_id)).emit("new-message", newMessage);
        req.server.io.to(String(data.sender_id)).emit("new-message", newMessage);
      }
  
      return newMessage;
  
    } catch (error) {
      reply.code(500).send(error);
    }
  };

exports.getMessages = async (req, reply) => {

    try {
  
      const { senderId, receiverId } = req.params;
      const messages = await userService.getMessages(senderId, receiverId);
      return messages;
    } catch (error) {
      reply.code(500).send(error);
  
    }
  
  };
