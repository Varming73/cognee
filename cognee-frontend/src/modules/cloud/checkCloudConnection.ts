import { fetch } from "@/utils";

export default function checkCloudConnection() {
  return fetch("/health", {
    method: "GET",
  }, true);
}
