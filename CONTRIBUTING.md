# Contributing 💻

All contributions are welcome and greatly appreciated!

## Steps to Contribute 💡

1. Fork this repository
2. Commit your changes
3. Test your changes (learn how to test below)
4. Open a pull request back to this repository
5. Notify the maintainers of this repository for peer review and approval
6. Merge!

The maintainers of this repository will create a new release with your changes so that everyone can use the new release and enjoy the awesome features of branch deployments

## Testing 🧪

This project requires **100%** test coverage

### Running the test suite (suggested)

Simply run the following command to execute the entire test suite:

```bash
npm run test
```

> Note: this requires that you have already run `npm install`

### Testing directly with IssueOps

You can test your changes by doing the following steps:

1. Commit your changes to the `main` branch on your fork
2. Open a new pull request
3. Run IssueOps commands on the pull request you just opened (`.deploy`, `.deploy noop`, `.deploy main`)
4. Ensure that all IssueOps commands work as expected on your testing PR

### Testing FAQs 🤔

Answers to questions you might have around testing

Q: Why do I have to commit my changes to `main`?

A: The `on: issue_comment` workflow only uses workflow files from the `main` branch by design - [learn more](https://github.com/GrantBirki/branch-deploy#security-)

Q: Is there an example PR I can view to see how testing with a pull request works?

A: Yes there is! It sure is a messy PR but here is a good [example](https://github.com/GrantBirki/branch-deploy/pull/18)

Q: What workflow is actually running when I do `.deploy` on my testing PR?

A: The workflow that is executing is stored in this repo and can be viewed [here](.github/workflows/test.yml)
