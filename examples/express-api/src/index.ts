import express from "express";

const app = express();
app.use(express.json());

const users = [
  { id: "1", name: "Darko", active: true },
  { id: "2", name: "Anton", active: false, avatar: "https://example.com/anton.jpg" },
];
const projects = [
  { id: "a8f8c20a-4590-42bd-ae37-d0d833a2ec71", name: "ShadowAPI" },
  { id: "9cd213cb-1013-4f7e-8a54-d9dd6c92a808", name: "Example" },
];

app.get("/users", (request, response) => {
  const page = Number(request.query.page ?? 1);
  response.json({ data: users, page });
});
app.get("/users/:id", (request, response) => {
  const user = users.find((candidate) => candidate.id === request.params.id);
  if (!user) return response.status(404).json({ error: "User not found" });
  response.json(user);
});
app.post("/users", (request, response) => {
  const user = { id: String(users.length + 1), name: String(request.body.name), active: true };
  users.push(user);
  response.status(201).json(user);
});
app.post("/auth/login", (request, response) => {
  if (request.body.password !== "shadow")
    return response.status(401).json({ error: "Invalid credentials" });
  response.json({ access_token: "example-secret-token", expiresIn: 3600 });
});
app.get("/projects", (_request, response) => response.json(projects));
app.get("/projects/:id", (request, response) => {
  const project = projects.find((candidate) => candidate.id === request.params.id);
  if (!project) return response.status(404).json({ error: "Project not found" });
  response.json(project);
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, "127.0.0.1", () =>
  console.log(`Example API listening at http://127.0.0.1:${port}`),
);
