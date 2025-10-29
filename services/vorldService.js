// services/vorldService.js
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

export class VorldService {
  static baseUrl = process.env.VORLD_API_BASE_URL || "https://api.thevorld.com";  
  static appId = process.env.VORLD_APP_ID;

  // Sync your user with Vorld
  static async syncUserToVorld(user) {
    try {
      if (!this.appId) throw new Error("Missing Vorld App ID");
      const payload = {
        app_id: this.appId,
        user_id: user._id.toString(),
        name: user.name,
        email: user.email,
      };
      const resp = await axios.post(`${this.baseUrl}/auth/register`, payload);
      return resp.data;
    } catch (err) {
      console.error("Vorld sync error:", err.response?.data || err.message);
      return null;
    }
  }

  // Optionally verify a token from Vorld
  static async verifyVorldToken(accessToken) {
    try {
      const resp = await axios.get(`${this.baseUrl}/auth/verify`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      return resp.data;
    } catch (err) {
      console.error("Vorld verify error:", err.response?.data || err.message);
      return null;
    }
  }
}
