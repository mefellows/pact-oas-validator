# Example Provider

Spike showing how a general OAS validator could be paired with a Pact contract, to check that the pact file is a valid subset of the Provider OAS. Specifically, it showcases the use of the `oneOf` operator.

NOTE: currently, if a consumer request doesn't expect all required attributes, it will fail.

It's a spike, so work needed!

## Usage

Play with the pact file and OAS, and run this CLI command to see if the pact is valid or not:

```
node index.js
```