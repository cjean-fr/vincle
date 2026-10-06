export const template = <template id="plain">Content</template>;
// @ts-expect-error Flow's template attributes are unavailable without Flow.
export const integrationAttribute = <template src="/fragment" buffer />;
