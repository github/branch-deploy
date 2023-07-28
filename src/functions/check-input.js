// Helper function to check an Action's input to ensure it is valid
// :param input: The input to check
// :returns: The input if it is valid, null otherwise
export async function checkInput(input) {
  // if the input is an empty string (most common), return null
  if (input === '' || input?.trim() === '') {
    return null
  }

  // if the input is null, undefined, or empty, return null
  if (input === null || input === undefined || input?.length === 0) {
    return null
  }

  // if the input is a string of null or undefined, return null
  if (input === 'null' || input === 'undefined') {
    return null
  }

  // if we made it this far, the input is valid, return it
  return input
}
