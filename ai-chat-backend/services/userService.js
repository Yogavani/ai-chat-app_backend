const userDao = require("../dao/userDao");
const messageDao = require("../dao/userDao");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");


exports.getUsers = async () => {
  return await userDao.getUsers();
};

exports.registerUser = async (data) => {

  const hashedPassword = await bcrypt.hash(data.password, 10);

  const user = {
    name: data.name,
    email: data.email,
    // password: hashedPassword
  };

  const result = await userDao.createUser(user);
  return {
    message: "User registered successfully",
    userId: result.insertId
  };
};

exports.loginUser = async (data) => {

  const user = await userDao.getUserByEmail(data.email);

  if (!user) {
    throw { message: "User not found" };
  }

  const passwordMatch = await bcrypt.compare(
    data.password,
    user.password
  );

  if (!passwordMatch) {
    throw { message: "Invalid password" };
  }

  const token = jwt.sign(
    { id: user.id, email: user.email },
    "chat_secret_key",
    { expiresIn: "1d" }
  );

  return {
    token,
    user
  };

};

exports.sendMessage = async (data) => {

    const result = await messageDao.sendMessage(data);
  
    return {
      message: "Message sent",
      messageId: result.insertId
    };
  
  };

  exports.getMessages = async (senderId, receiverId) => {

    const messages = await messageDao.getMessages(senderId, receiverId);
    return messages;
  
  };
  
