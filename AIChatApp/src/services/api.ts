import axios from "axios";

const API = axios.create({
  baseURL: "http://192.168.13.42:5000"
});

export default API;