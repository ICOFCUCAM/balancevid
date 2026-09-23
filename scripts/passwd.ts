/**
 * Generate a password hash for an instance.  [Doctrine D-06]
 *
 *   npm run passwd                 # prompts, hidden
 *   npm run passwd -- 'secret'     # for a script; it will be in your history
 *
 * Prints the line to put in the environment. The plaintext is never written
 * anywhere by this script.
 */
import { createInterface } from 'node:readline';
import { hashPassword } from '../src/auth/config.js';

const MIN_LENGTH = 12;

async function prompt(): Promise<string> {
  const argument = process.argv[2];
  if (argument) return argument;

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Turn off echo so the password does not end up on screen or in a scrollback
  // someone screenshots later.
  const stdin = process.stdin as NodeJS.ReadStream & { isTTY?: boolean };
  const hidden = Boolean(stdin.isTTY);
  if (hidden) {
    const output = rl as unknown as { output: NodeJS.WriteStream; _writeToOutput: unknown };
    output._writeToOutput = function write(this: { output: NodeJS.WriteStream }, text: string) {
      this.output.write(text.includes('Password') ? text : '');
    };
  }
  return new Promise((resolve) => {
    rl.question('Password: ', (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}

const password = (await prompt()).trim();

if (password.length < MIN_LENGTH) {
  console.error(`\nToo short. This is the only thing in front of every recording on the`);
  console.error(`instance, and it is reachable from the internet — use at least ${MIN_LENGTH}`);
  console.error('characters, or a passphrase.');
  process.exit(1);
}

console.log(`\nBALANCEVID_PASSWORD_HASH='${hashPassword(password)}'\n`);
console.log('Set that in the deployment\'s environment and redeploy.');
console.log('Changing it signs every session out, which is what to do if it leaks.');
