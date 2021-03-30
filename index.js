(async () => {

  const Enforcer = require('openapi-enforcer')
  const fs = require('fs')
  const R = require('ramda')

  // Load the OAS
  const { error: schemaError, warning: schemaWarning, value: validatedSchema } = await Enforcer("oas/products.yml", { fullResult: true });

  // Validate the OAS
  if (schemaError) {
    console.log(schemaError)
    process.exit(1)
  }

  // Load the Pact file
  // - extract all examples, ditching the matching rules
  // - for each interaction, do a schema check
  const pactFile = fs.readFileSync("./pacts/example.json")
  const pact = JSON.parse(Buffer.from(pactFile, "utf-8").toString())


  // validate that a request and response matches the spec, which references a legitimate api operation
  const errors = pact.interactions.map(async (interaction) => {
    const { error: requestError, warning: requestWarning, value: validatedRequest } = await validatedSchema.request(interaction.request);
    console.log(`verifying interaction: ${interaction.description} given ${interaction.providerState}, with request ${interaction.request.method} ${interaction.request.path}`)

    if (requestError) console.log(requestError)

    if (validatedRequest) {
      // Check response schema
      // TODO: check headers etc.
      // TODO: the pact example may only use a subset of the response schema of the OAS, it shouldn't fail the schema validation
      //       this is probably where Atlassian have to do custom JSON schema magic, because it gets complicated when the response schema
      //       is anything more than a basic set of parameters (e.g. any use of anyOf, allOf etc.)
      const { error : responseError, warning : responseWarning, value: response } = await validatedRequest.response(interaction.response.status, R.pathOr(undefined, ['response', 'body'], interaction), R.pathOr(undefined, ['response', 'headers'], interaction));
      if (responseError) console.log(requestError)

      return [requestError, responseError]
    }

    return [requestError]
  })

  // Print errors
  const res = await Promise
    .all(errors)
    .then(R.flatten)
    .then(R.reject(R.isNil))

  if (res.length > 0) {
    process.exit(1)
  }

  console.log('successfully validated!')
})()