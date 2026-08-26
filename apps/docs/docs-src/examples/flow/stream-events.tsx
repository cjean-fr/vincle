import { on, type EventEmitter } from "node:events";
import { Template } from "@vincle/flow";

declare const priceFeed: EventEmitter; // emits "price" with { symbol, value }

// Each event becomes its own patch — the stream stays open for as long as
// the connection does, not until some fixed dataset is exhausted.
function LivePrice() {
  return (
    <Template target="price">
      {async function* (signal) {
        for await (const [price] of on(priceFeed, "price", { signal })) {
          yield <span>{price.symbol}: {price.value}</span>;
        }
      }}
    </Template>
  );
}
