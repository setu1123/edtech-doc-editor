// A simulation script to test deterministic Lamport Clock conflict resolution logic

function resolveConflict(local, incoming) {
  // If incoming has a higher clock, incoming wins
  if (incoming.lamportClock > local.lamportClock) {
    return { winner: "incoming", reason: "Higher Lamport Clock" };
  }
  // If clocks are equal, compare Client IDs lexicographically (smaller wins)
  if (incoming.lamportClock === local.lamportClock) {
    if (incoming.clientId < local.clientId) {
      return { winner: "incoming", reason: "Tie break: Smaller Client ID wins" };
    } else {
      return { winner: "local", reason: "Tie break: Local Client ID wins" };
    }
  }
  // Otherwise, local wins
  return { winner: "local", reason: "Local Lamport Clock is higher" };
}

console.log("=== Running Conflict Resolution Tests ===");

// Scenario 1: Remote edit has higher clock (remote edits after client offline modifications)
const local1 = { content: "Local content", lamportClock: 5, clientId: "client_aaa" };
const remote1 = { content: "Remote update", lamportClock: 7, clientId: "client_bbb" };
const res1 = resolveConflict(local1, remote1);
console.log(`Test 1 (Higher Clock Wins): Winner is ${res1.winner} (${res1.reason})`);
if (res1.winner !== "incoming") console.error("Test 1 Failed!");

// Scenario 2: Local edit has higher clock (local edits offline after remote version)
const local2 = { content: "Local offline edit", lamportClock: 9, clientId: "client_aaa" };
const remote2 = { content: "Remote old update", lamportClock: 6, clientId: "client_bbb" };
const res2 = resolveConflict(local2, remote2);
console.log(`Test 2 (Local Higher Wins): Winner is ${res2.winner} (${res2.reason})`);
if (res2.winner !== "local") console.error("Test 2 Failed!");

// Scenario 3: Tie breaker (clocks equal, lexicographically smaller clientId wins)
const local3 = { content: "Local concurrent", lamportClock: 8, clientId: "client_zzz" };
const remote3 = { content: "Remote concurrent", lamportClock: 8, clientId: "client_aaa" };
const res3 = resolveConflict(local3, remote3);
console.log(`Test 3 (Equal Clocks, Smaller Client ID Wins): Winner is ${res3.winner} (${res3.reason})`);
if (res3.winner !== "incoming") console.error("Test 3 Failed!");

console.log("=== Conflict Resolution Tests Complete ===");
