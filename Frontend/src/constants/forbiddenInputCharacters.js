const FORBIDDEN_INPUT_CHARS_PATTERN = /[@#$^&*{}[\]<>]/g
const INPUT_NUMBERS_PATTERN = /\d/g
const HAS_NUMBER_PATTERN = /\d/

export function sanitizeForbiddenInputChars(value) {
  return String(value ?? '').replace(FORBIDDEN_INPUT_CHARS_PATTERN, '')
}

export function containsForbiddenInputChars(value) {
  return String(value ?? '').search(FORBIDDEN_INPUT_CHARS_PATTERN) >= 0
}

export function sanitizeNameInput(value) {
  return sanitizeForbiddenInputChars(value).replace(INPUT_NUMBERS_PATTERN, '')
}

export function containsNumbers(value) {
  return HAS_NUMBER_PATTERN.test(String(value ?? ''))
}
