// =============================================================================
// MQTT Client — connects to broker via WebSocket TLS, SUBSCRIBE-ONLY.
// -----------------------------------------------------------------------------
// MONITORING-ONLY system — there are NO commands to send, NO ack transactions.
// The PWA only listens to status/log/online topics published by the ESP32.
//
// Topics (brief §7.3):
//   plts/<deviceId>/status  (QoS 0) — telemetry publish (5s)
//   plts/<deviceId>/log     (QoS 0) — log events
//   plts/<deviceId>/online  (QoS 1, retain, LWT) — presence
//
// DROPPED from reference (relay-specific):
//   - mqttTransaction.ts (ACK transaction with 5s timeout + reconciliation)
//   - mqttPending.ts (pending-command tracking)
//   - sendCommandWithAck()
//   - command/ack/ota topics
// =============================================================================

import mqtt from "mqtt";
import type { SystemStatus, ActivityLog } from "./types";

// MQTT Broker URL — configurable via env var for production (self-hosted broker)
// Default: HiveMQ public broker (free, no auth, for demo/MVP)
// Production: set NEXT_PUBLIC_MQTT_BROKER_URL to your authenticated broker
const MQTT_BROKER_URL =
  process.env.NEXT_PUBLIC_MQTT_BROKER_URL || "wss://broker.hivemq.com:8884/mqtt";
const MQTT_BROKER_USERNAME = process.env.NEXT_PUBLIC_MQTT_USERNAME || "";
const MQTT_BROKER_PASSWORD = process.env.NEXT_PUBLIC_MQTT_PASSWORD || "";

type MqttState = {
  client: mqtt.MqttClient | null;
  deviceId: string | null;
  connected: boolean;
};

type StatusCallback = (status: SystemStatus) => void;
type LogCallback = (log: ActivityLog) => void;
type OnlineCallback = (online: boolean) => void;

const state: MqttState = {
  client: null,
  deviceId: null,
  connected: false,
};

const statusCallbacks = new Set<StatusCallback>();
const logCallbacks = new Set<LogCallback>();
const onlineCallbacks = new Set<OnlineCallback>();

export function getMqttDeviceId(): string | null {
  if (state.deviceId) return state.deviceId;
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem("plts-mqtt-device-id");
  }
  return null;
}

export function setMqttDeviceId(deviceId: string | null) {
  state.deviceId = deviceId;
  if (typeof localStorage !== "undefined") {
    if (deviceId) {
      localStorage.setItem("plts-mqtt-device-id", deviceId);
    } else {
      localStorage.removeItem("plts-mqtt-device-id");
    }
  }
}

export function isMqttConfigured(): boolean {
  return !!getMqttDeviceId();
}

export function isMqttConnected(): boolean {
  return state.connected;
}

export function connectMqtt(deviceId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (state.client) {
      state.client.end(true);
      state.client = null;
    }

    // DeviceId format for PLTS: "PLTS-AB12CD34" (8 hex chars)
    // Normalize to uppercase, strip non-alphanumeric (keep dashes).
    const normalized = deviceId.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (!/^PLTS-[A-F0-9]{8}$/.test(normalized)) {
      reject(new Error("Device ID must be format PLTS-AB12CD34 (8 hex chars)"));
      return;
    }
    state.deviceId = normalized;

    const baseTopic = `plts/${state.deviceId}`;
    const clientId = `pwa-${crypto.randomUUID()}`;

    console.log(`[MQTT] Connecting to ${MQTT_BROKER_URL} as ${clientId}...`);

    const client = mqtt.connect(MQTT_BROKER_URL, {
      clientId,
      keepalive: 60,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      clean: true,
      ...(MQTT_BROKER_USERNAME ? { username: MQTT_BROKER_USERNAME } : {}),
      ...(MQTT_BROKER_PASSWORD ? { password: MQTT_BROKER_PASSWORD } : {}),
    });

    state.client = client;

    let settled = false;
    const resolveOnce = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const rejectOnce = (err: Error) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    client.on("connect", () => {
      console.log("[MQTT] Connected to broker, subscribing...");
      // Subscribe-only — no command/ack/ota topics needed (monitoring-only).
      client.subscribe(
        [`${baseTopic}/status`, `${baseTopic}/log`, `${baseTopic}/online`],
        { qos: 1 },
        (err, granted) => {
          if (err) {
            console.error("[MQTT] Subscribe error:", err);
            state.connected = false;
            rejectOnce(new Error(`MQTT subscription failed: ${err.message}`));
            return;
          }
          const expectedTopics = 3;
          if (!granted || granted.length !== expectedTopics) {
            console.error("[MQTT] Incomplete subscriptions:", granted);
            state.connected = false;
            rejectOnce(
              new Error(
                `MQTT subscription incomplete: expected ${expectedTopics}, got ${granted?.length ?? 0}`,
              ),
            );
            return;
          }
          const denied = granted.filter((g: { qos: number; topic: string }) => g.qos === 128);
          if (denied.length > 0) {
            console.error("[MQTT] Subscriptions denied:", denied);
            state.connected = false;
            rejectOnce(
              new Error(
                `MQTT subscriptions denied: ${denied.map((d: { topic: string }) => d.topic).join(", ")}`,
              ),
            );
            return;
          }
          console.log("[MQTT] All subscriptions confirmed:", granted);
          state.connected = true;
          onlineCallbacks.forEach((cb) => cb(true));
          resolveOnce();
        },
      );
    });

    client.on("message", (topic: string, payload: Buffer) => {
      const msg = payload.toString();
      if (topic.endsWith("/status")) {
        try {
          const status = JSON.parse(msg) as SystemStatus;
          statusCallbacks.forEach((cb) => cb(status));
        } catch (e) {
          console.error("[MQTT] Failed to parse status JSON:", e);
        }
      } else if (topic.endsWith("/log")) {
        try {
          const log = JSON.parse(msg) as ActivityLog;
          logCallbacks.forEach((cb) => cb(log));
        } catch (e) {
          console.error("[MQTT] Failed to parse log JSON:", e);
        }
      } else if (topic.endsWith("/online")) {
        const online = msg === "1";
        onlineCallbacks.forEach((cb) => cb(online));
      }
    });

    client.on("error", (err: Error) => {
      console.error("[MQTT] Error:", err.message);
      if (!settled) {
        rejectOnce(err);
      }
    });

    client.on("offline", () => {
      console.log("[MQTT] Offline");
      state.connected = false;
      onlineCallbacks.forEach((cb) => cb(false));
    });

    client.on("reconnect", () => {
      console.log("[MQTT] Reconnecting...");
    });
  });
}

export function disconnectMqtt() {
  if (state.client) {
    state.client.end(true);
    state.client = null;
  }
  state.connected = false;
  state.deviceId = null;
}

export function onStatusChange(cb: StatusCallback): () => void {
  statusCallbacks.add(cb);
  return () => statusCallbacks.delete(cb);
}

export function onLog(cb: LogCallback): () => void {
  logCallbacks.add(cb);
  return () => logCallbacks.delete(cb);
}

export function onOnlineChange(cb: OnlineCallback): () => void {
  onlineCallbacks.add(cb);
  return () => onlineCallbacks.delete(cb);
}
