export type VaultRecord = {
  version: 1;
  salt: string;
  iv: string;
  ciphertext: string;
  iterations: number;
  createdAt: string;
  updatedAt: string;
};
