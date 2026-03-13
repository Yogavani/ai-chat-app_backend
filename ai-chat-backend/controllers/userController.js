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
    try {
  
      const result = await userService.loginUser(request.body);
      return result;
    } catch (error) {
      reply.code(400).send(error);
  
    }
  };

exports.sendMessage = async (req, reply) => {
  try {
    const result = await userService.sendMessage(req.body);
    return result;
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
