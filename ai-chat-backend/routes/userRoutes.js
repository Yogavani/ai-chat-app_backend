const userHandler = require("../controllers/userController");
const { USER } = require("../constants/messages");

async function userRoutes(server, options) {

  server.get(USER.GET_USERS, userHandler.getUsers);
  server.post(USER.REGISTER, userHandler.registerUser);
  server.post(USER.LOGIN, userHandler.loginUser);
  server.post(USER.SEND_MESSAGE, userHandler.sendMessage);
  server.get(USER.RECEIVE_MESSAGE, userHandler.getMessages);
}

module.exports = userRoutes;