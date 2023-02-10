import * as core from '@actions/core'

// Helper function to convert a String to an Array specifically in Actions
// :param string: A comma seperated string to convert to an array
// :return Array: The function returns an Array - can be empty
export async function stringToArray(string) {
  try {
    // If the String is empty, return an empty Array
    if (string.trim() === '') {
      core.debug(
        'in stringToArray(), an empty String was found so an empty Array was returned'
      )
      return []
    }

    // Split up the String on commas, trim each element, and return the Array
    return string.split(',').map(target => target.trim())
  } catch (error) {
    core.error(`failed string for debugging purposes: ${string}`)
    throw new Error(`could not convert String to Array - error: ${error}`)
  }
}
