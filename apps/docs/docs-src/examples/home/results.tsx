// Replace this sample data source with your database or search service.
async function findResults() {
  return [{ title: "Getting started", href: "/guide/getting-started/installation" }];
}

export async function Results() {
  const items = await findResults();
  return (
    <ul>
      {items.map((item) => (
        <li>
          <a href={item.href}>{item.title}</a>
        </li>
      ))}
    </ul>
  );
}
