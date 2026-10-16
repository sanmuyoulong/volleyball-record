import { navigate } from "./session.js";
const key = new URLSearchParams(location.search).get("id");
navigate(`../console/?view=${key ? "event&id=" + encodeURIComponent(key) : "events"}`);
