// Simple script to check localStorage content
console.log("Checking localStorage for pendingOcrCards...");

const pendingOcrCards = localStorage.getItem('pendingOcrCards');
if (pendingOcrCards) {
  console.log("Found pendingOcrCards:");
  console.log(JSON.parse(pendingOcrCards));
} else {
  console.log("No pendingOcrCards found in localStorage");
}

console.log("All localStorage keys:");
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  console.log(key, localStorage.getItem(key));
}