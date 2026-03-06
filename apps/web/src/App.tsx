import { userSchema } from "@pulse/shared";

const demoUser = userSchema.parse({
  id: "web-user",
  name: "Pulse",
});

function App() {
  return <h1>Hello {demoUser.name}</h1>;
}

export default App;
