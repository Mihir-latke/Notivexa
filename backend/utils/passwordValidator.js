/**
 * Password strength validator for Notivexa.
 * Enforces:
 * 1. Minimum 7 characters total (4 letters + 2 numbers + 1 special = 7)
 * 2. At least 4 letters (a-z, A-Z)
 * 3. At least 2 numbers (0-9)
 * 4. At least 1 special character (!@#$%^&*()_+-=[]{};':"|,.<>/?~`)
 */

const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/;

function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return {
      valid: false,
      message: 'Password is required.',
      rules: { length: false, letters: false, numbers: false, special: false }
    };
  }

  const lengthValid = password.length >= 7;
  const letterMatches = password.match(/[a-zA-Z]/g) || [];
  const lettersValid = letterMatches.length >= 4;

  const numberMatches = password.match(/\d/g) || [];
  const numbersValid = numberMatches.length >= 2;

  const specialValid = SPECIAL_CHAR_REGEX.test(password);

  const valid = lengthValid && lettersValid && numbersValid && specialValid;

  let message = '';
  if (!lengthValid) {
    message = 'Password must be at least 7 characters long.';
  } else if (!lettersValid) {
    message = 'Password must contain at least 4 letters.';
  } else if (!numbersValid) {
    message = 'Password must contain at least 2 numbers.';
  } else if (!specialValid) {
    message = 'Password must contain at least 1 special key (e.g. !@#$%^&*).';
  }

  return {
    valid,
    message,
    rules: {
      length: lengthValid,
      letters: lettersValid,
      numbers: numbersValid,
      special: specialValid
    }
  };
}

module.exports = {
  validatePasswordStrength,
  SPECIAL_CHAR_REGEX
};
