import { Fill } from "@vincle/flow";

declare function fetchRows(page: number): Promise<{ id: number; name: string }[]>;

// Each yield produces an independent patch with the configured merge type.
function Feed() {
  return (
    <Fill target="feed" merge="append">
      {async function* () {
        let page = 1;
        while (true) {
          const rows = await fetchRows(page++);
          if (rows.length === 0) break;
          for (const row of rows) {
            yield <tr key={row.id}>{row.name}</tr>;
          }
        }
      }}
    </Fill>
  );
}
