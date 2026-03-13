const db = require("../config/db");

exports.getUsers = () => {
  return new Promise((resolve, reject) => {
    db.query("SELECT * FROM users", (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};

exports.createUser = (user) => {

    return new Promise((resolve, reject) => {
  
      const query =
        "INSERT INTO users (name,email,password) VALUES (?,?,?)";
  
      db.query(
        query,
        [user.name, user.email, user.password],
        (err, result) => {
  
          if (err) reject(err);
          else resolve(result);
  
        }
      );
    });
  };

  exports.getUserByEmail = (email) => {

    return new Promise((resolve, reject) => {
  
      const query = "SELECT * FROM users WHERE email = ?";
  
      db.query(query, [email], (err, result) => {
  
        if (err) reject(err);
  
        else resolve(result[0]);
  
      });
  
    });
  
  };

  exports.sendMessage = (data) => {

    return new Promise((resolve, reject) => {
  
      const query =
        "INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)";
  
      db.query(
        query,
        [data.sender_id, data.receiver_id, data.message],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
  
    });
  };

  exports.getMessages = (senderId, receiverId) => {

    return new Promise((resolve, reject) => {
  
      const query = `
        SELECT * FROM messages
        WHERE (sender_id = ? AND receiver_id = ?)
        OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at ASC
      `;
  
      db.query(
        query,
        [senderId, receiverId, receiverId, senderId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
  
    });
  
  };