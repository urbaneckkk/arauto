export interface Logger {
  info(mensagem: string): void;
  aviso(mensagem: string): void;
  erro(mensagem: string): void;
}

export const logSilencioso: Logger = { info() {}, aviso() {}, erro() {} };

export const logConsole: Logger = {
  info: (mensagem) => console.log(mensagem),
  aviso: (mensagem) => console.warn(`⚠ ${mensagem}`),
  erro: (mensagem) => console.error(`✖ ${mensagem}`),
};
