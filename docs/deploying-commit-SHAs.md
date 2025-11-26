# Deploying Commit SHAs

## TL;DR

Instead of this:

```yaml
- name: branch-deploy
  id: branch-deploy
  uses: github/branch-deploy@vX.X.X

- name: checkout
  if: steps.branch-deploy.outputs.continue == 'true'
  uses: actions/checkout@v6
  with:
    ref: ${{ steps.branch-deploy.outputs.ref }} # <-- This is the branch name, can be risky
```

Do this:

```yaml
- name: branch-deploy
  id: branch-deploy
  uses: github/branch-deploy@vX.X.X

- name: checkout
  if: steps.branch-deploy.outputs.continue == 'true'
  uses: actions/checkout@v6
  with:
    ref: ${{ steps.branch-deploy.outputs.sha }} # <-- uses an exact commit SHA - safe!
```

This ensures you are deploying the __exact__ commit SHA that branch-deploy has determined is safe to deploy. This is a best practice for security, reliability, and safety during deployments.

Don't worry, this is still a _branch deployment_, you are just telling your deployment process to use the __exact commit SHA__ that the branch points to rather than the branch name itself which is mutable.

## Introduction

Deploying commit SHAs (Secure Hash Algorithms) is a best practice in software development and deployment processes. This document explains the importance of deploying commit SHAs, focusing on aspects of security, reliability, and safety. It also provides an overview of how commit SHAs work under the hood in Git and how this contributes to the overall safety of the deployment process.

## Importance of Deploying Commit SHAs

### Security

1. Immutable References: Commit SHAs are immutable references to specific states of the codebase. Once a commit is created, its SHA cannot be changed. This ensures that the exact code being deployed is known and cannot be altered without changing the SHA.
2. Verification: Using commit SHAs allows for the verification of the code being deployed. Security tools can check the integrity of the code by comparing the SHA of the deployed code with the expected SHA. Commits can be signed with GPG keys to further enhance security.
3. Auditability: Deploying specific commit SHAs provides a clear audit trail. It is easy to track which code was deployed and when, making it easier to investigate and resolve security incidents.

### Reliability

1. Consistency: Deploying commit SHAs ensures that the same code is deployed across different environments (e.g., staging, production). This consistency reduces the risk of discrepancies and bugs that may arise from deploying different versions of the code.
2. Reproducibility: With commit SHAs, deployments are reproducible. If an issue arises, it is possible to redeploy the exact same code by referencing the same SHA, ensuring that the environment is identical to the previous deployment.
3. Rollback: In case of a failure, rolling back to a previous commit SHA is straightforward. This allows for quick recovery and minimizes downtime. In the context of this project, it is best to deploy the `main` (stable) branch during rollbacks. However, this project does support deploying specific commit SHAs through the [`allow_sha_deployments`](./sha-deployments.md) input option.

### Safety

1. Atomic Changes: Each commit SHA represents an atomic change to the codebase. Deploying commit SHAs ensures that all changes in a commit are deployed together, reducing the risk of partial deployments that can lead to inconsistencies.
2. Isolation: Commit SHAs isolate changes, making it easier to identify and isolate issues. If a deployment fails, it is easier to pinpoint the problematic commit and address the issue. For example, if a specific commit introduces a bug, rolling back to the previous commit SHA can resolve the issue.
3. Predictability: Deploying commit SHAs provides predictability in the deployment process. Knowing exactly what code is being deployed reduces uncertainty and increases confidence in the deployment process.

## How Commit SHAs Work in Git

### Under the Hood

1. SHA-1 Hashing: Git uses the SHA-1 hashing algorithm to generate a unique identifier (SHA) for each commit. This SHA is a 40-character hexadecimal string that uniquely represents the commit.
2. Content-Based: The SHA is generated based on the content of the commit, including the changes made, the commit message, the author, and the timestamp. This ensures that even a small change in the commit will result in a different SHA.
3. Immutable: Once a commit is created, its SHA cannot be changed. This immutability ensures that the commit reference is stable and reliable.

## How Commits Compare to Branches or Tags

Branches and tags can be moved or updated to point to different commits. This mutability can lead to inconsistencies and unexpected changes in the deployed code. For this reason, deploying commit SHAs is preferred over deploying branches or tags. Now this might be somewhat confusing as the name of this project is `branch-deploy`. This is because at a high-level we are indeed deploying _branches_ but in reality, we are deploying the exact _commit_ that the branch points to. This is often the latest commit on the branch but it does not have to be based on the input options provided.

## Conclusion

Deploying commit SHAs is a best practice that enhances the security, reliability, and safety of the deployment process. By leveraging the immutable and content-based nature of commit SHAs, organizations can ensure that their deployments are consistent, reproducible, and traceable. Understanding how commit SHAs work under the hood in Git further underscores their importance in maintaining the integrity and stability of the codebase during deployments.

This Action will take care of all the heavy lifting for you under the hood when it comes to commits. It will set an output named `sha` on __every single deployment__ that will point to the exact commit SHA that you should utilize for your deployment process.
