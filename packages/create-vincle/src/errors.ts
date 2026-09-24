export const ERR_CREATE_CLI = "ERR_VINCLE_CREATE_CLI";
export const ERR_CREATE_PROJECT = "ERR_VINCLE_CREATE_PROJECT";
export const ERR_CREATE_INSTALL = "ERR_VINCLE_CREATE_INSTALL";

export type CreateErrorCode =
  | typeof ERR_CREATE_CLI
  | typeof ERR_CREATE_PROJECT
  | typeof ERR_CREATE_INSTALL;

export function createError<Code extends CreateErrorCode>(
  message: string,
  code: Code,
): Error & { code: Code } {
  const error = new Error(`[vincle/create-vincle] ${message}`) as Error & {
    code: Code;
  };
  error.code = code;
  return error;
}
