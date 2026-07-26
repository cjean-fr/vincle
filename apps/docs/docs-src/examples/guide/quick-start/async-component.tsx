import { renderToString, type VNode } from "@vincle/core";

declare const db: {
  users: {
    findById(id: string): Promise<{ name: string; email: string }>;
  };
};

async function UserCard({ id }: { id: string }) {
  const user = await db.users.findById(id);
  return (
    <div class="card">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
}

const html = await // @ts-expect-error Async component supported at runtime
renderToString(<UserCard id="42" /> as unknown as VNode);
