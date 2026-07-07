const BASE = "http://localhost:4000/api";

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId: "OZNADMIN", password: "ChangeMe@123" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.accessToken as string;
}

async function main() {
  const token = await login();
  const summaryRes = await fetch(`${BASE}/dashboard/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const todayRes = await fetch(`${BASE}/dashboard/today`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const summary = await summaryRes.json();
  const today = await todayRes.json();

  console.log("GET /dashboard/summary", summaryRes.status, summary.summary);
  console.log("GET /dashboard/today", todayRes.status, "rows:", today.items?.length);

  const s = summary.summary;
  const sum = s.presentToday + s.halfDayToday + s.absentToday;
  if (sum !== s.totalEmployees) {
    throw new Error(`present+half+absent (${sum}) != total (${s.totalEmployees})`);
  }
  console.log("Balance check: present + half + absent = total employees OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
