import axios from "axios"
const instance = axios.create({
    // REACT_APP_API_URL must include the version, e.g. http://localhost:8001/api/v1
    baseURL: process.env.REACT_APP_API_URL || "/api/v1"
})
export default instance
