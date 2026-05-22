import app from "./config";

import {
  getDatabase
} from "firebase/database";

const realtime = getDatabase(app);

export default realtime;