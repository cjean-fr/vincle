// Cross-document transitions can be skipped (for example when the destination
// opts out). In that case `ready` rejects, but navigation still succeeds.
function handleTransition(event: Event): void {
  const transition = (event as Event & { viewTransition?: ViewTransition | null }).viewTransition;
  void transition?.ready.catch(() => {});
}

window.addEventListener("pageswap", handleTransition);
window.addEventListener("pagereveal", handleTransition);
