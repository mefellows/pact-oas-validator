// https://github.com/byu-oit/openapi-enforcer/issues/90
const Enforcer = require('openapi-enforcer')
const fs = require('fs')
const R = require('ramda')

// Recurses an (OAS schema) object, deleting required fields
const removeRequiredFields = (obj, parent = [], paths = []) => {
  const newPaths = paths
  Object.keys(obj).forEach(k => {
    newPaths.push([...parent, k])

    // Note: it's not necessary to delete the component schema object
    // because the $refs are resolved and inlined, meaning one delete removes from any referenced location
    // We could delete the schema definitions first, but then we'd still need to do this in case of inline properties!
    if (k === "required" && newPaths[newPaths.length-1].join(".").match(/responses\.[0-9]{3}\.content\..*schema/) && Array.isArray(obj[k])) {
      delete obj[k]
    }

    if (typeof obj[k] == "object" && !R.isNil(obj[k])) {
      removeRequiredFields(obj[k], newPaths[newPaths.length-1], newPaths)
    }
  })

  return newPaths
}

(async () => {

  // Load the OAS
  const { error: schemaError, warning: schemaWarning, value: validatedSchema } = await Enforcer("oas/products.yml", { fullResult: true });

  // Validate the OAS
  if (schemaError) {
    console.log(schemaError)
    process.exit(1)
  }

  const { value: schemaWithoutRequiredFields } = await Enforcer("oas/products.yml", { fullResult: true });
  removeRequiredFields(schemaWithoutRequiredFields)

  // Load the Pact file
  // - extract all examples, ditching the matching rules
  // - for each interaction, do a schema check
  const pactFile = fs.readFileSync("./pacts/example.json")
  const pact = JSON.parse(Buffer.from(pactFile, "utf-8").toString())

  // validate that a request and response matches the spec, which references a legitimate api operation
  const errors = pact.interactions.map(async (interaction) => {
    const errors = []
    console.log(`verifying interaction: ${interaction.description} given ${interaction.providerState}, with request ${interaction.request.method} ${interaction.request.path}`)

    const { error: requestError, value: validatedRequest } = await validatedSchema.request(interaction.request);
    errors.push(requestError)

    if (requestError) console.log(requestError)

    if (validatedRequest) {
      // Check response schema
      // NOTE: the pact example may only use a subset of the response schema of the OAS, it shouldn't fail the schema validation
      //       this is probably where Atlassian have to do custom JSON schema magic, because it gets complicated when the response schema
      //       is anything more than a basic set of parameters (e.g. any use of anyOf, allOf etc.)
      //
      // Two approaches to deal with this
      // 1. Find the response schema, traverse it and remove all instances of "required" <- trying this one
      // 2. Use as is, and filter out any errors that relate to "required" validations (it seems errors aren't currently machine readable, so start with [1])
      const { value: pactRequest } = await schemaWithoutRequiredFields.request(interaction.request);
      const { error : responseError } = await pactRequest.response(interaction.response.status, R.pathOr(undefined, ['response', 'body'], interaction), R.pathOr(undefined, ['response', 'headers'], interaction));
      errors.push(responseError)

      if (responseError) console.log(responseError)
    }

    return errors
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