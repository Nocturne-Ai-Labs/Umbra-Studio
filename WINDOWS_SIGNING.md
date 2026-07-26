# Windows Code Signing

Umbra Studio signs the final Windows `UmbraStudio.exe` with Microsoft Artifact
Signing before the portable ZIP is created. Tagged releases fail if signing is
not configured or if the resulting Authenticode signature cannot be verified.

## Publisher Identity

Artifact Signing Public Trust certificates use a Microsoft-validated legal
identity. The certificate common name and organization cannot be arbitrary.
To display `Nocturne AI Labs`, validate that exact legal entity or registered
DBA. An individual developer profile displays the developer's validated legal
name instead.

Signing gives every release a verified publisher and allows publisher
reputation to accumulate across versions. It does not guarantee that a new
publisher immediately bypasses Microsoft Defender SmartScreen. Microsoft Store
distribution is the only documented path that avoids SmartScreen download
warnings from the first install.

## Azure Setup

1. Create an Azure subscription and Microsoft Entra tenant.
2. Register the `Microsoft.CodeSigning` resource provider.
3. Create an Artifact Signing account.
4. Complete a **Public Trust** identity validation.
5. Create a Public Trust certificate profile from the validated identity.
6. Assign the `Artifact Signing Certificate Profile Signer` role to the Entra
   application used by GitHub Actions.
7. Add a federated identity credential for
   `Nocturne-Ai-Labs/Umbra-Studio` so GitHub Actions can authenticate with OIDC.

Use Microsoft's current setup guides:

- https://learn.microsoft.com/azure/artifact-signing/quickstart
- https://learn.microsoft.com/azure/artifact-signing/how-to-signing-integrations

## GitHub Configuration

Add these repository **secrets**:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Add these repository **variables**:

- `ARTIFACT_SIGNING_ENDPOINT`
  - Example: `https://eus.codesigning.azure.net/`
- `ARTIFACT_SIGNING_ACCOUNT_NAME`
- `ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME`
- `WINDOWS_SIGNING_SUBJECT`
  - Use a stable substring from the verified certificate subject, such as
    `Nocturne AI Labs`.

Do not store certificate private keys or Azure client secrets in the repository.
The workflow uses GitHub OIDC and Artifact Signing's managed certificate.

## Release Order

The Windows release job deliberately follows this order:

1. Build the portable folder.
2. Finish icon and version-resource patching.
3. Authenticate to Azure through GitHub OIDC.
4. Sign only the final packaged `UmbraStudio.exe`.
5. Add the Microsoft RFC 3161 timestamp.
6. Verify the signature and publisher with `Get-AuthenticodeSignature`.
7. Create and upload the portable ZIP.

Never modify `UmbraStudio.exe` after signing. Any later resource or byte-level
change invalidates its Authenticode signature.
