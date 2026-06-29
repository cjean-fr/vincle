import { renderToString } from "@vincle/core";

declare const db: {
  posts: {
    findAll(opts: {
      limit: number;
    }): Promise<{ id: number; slug: string; title: string }[]>;
  };
};

const Feed = async () => {
  const posts = await db.posts.findAll({ limit: 10 });
  return (
    <ul>
      {posts.map((p) => (
        <li key={p.id}>
          <a href={"/posts/" + p.slug}>{p.title}</a>
        </li>
      ))}
    </ul>
  );
};

// renderToString awaits the entire tree, including
// nested async components
const html = await renderToString(<Feed />);
