# Encryption export compliance

Skriuw's mobile client encrypts. Both stores ask about it, and the App Store
asks every time a build is uploaded. These are the answers, with the facts they
rest on.

**This is not legal advice.** The classification below is the ordinary reading
for a free, open-source, mass-market application using standard cryptography,
and it should be confirmed before the first submission rather than after.

## What the app encrypts, and with what

| Use | Algorithm | Where |
| --- | --- | --- |
| Sync payloads (note bodies, titles, tags, people, media, checkpoints) | XChaCha20-Poly1305, key from Argon2id (19 MiB, t = 2) over a recovery code | `crates/skriuw-crypto`, [ADR-0043](../../docs/adr/0043-end-to-end-encrypted-sync.md) |
| Locked note bodies at rest | XChaCha20-Poly1305, key wrapped under an Argon2id key from the PIN/passphrase and, separately, from a recovery code | `crates/skriuw-crypto`, [ADR-0044](../../docs/adr/0044-locked-notes.md) |
| Sign-in credential and the biometric-gated PIN | Platform keystore (Android Keystore, iOS Keychain) | `mobile/src/features/auth/keystore.ts`, `mobile/src/features/lock/biometrics.ts` |
| Transport | HTTPS/TLS, provided by the platform | — |

All of it is standard, published, unmodified cryptography from well-known
libraries. Skriuw implements no proprietary algorithm.

## App Store Connect

### `Info.plist`

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<true/>
<key>ITSEncryptionExportComplianceCode</key>
<string><!-- issued by Apple after the first compliance questionnaire --></string>
```

`ITSAppUsesNonExemptEncryption` is **true**. The common shortcut of setting it
to `false` is wrong here: that answer is for apps whose only cryptography is
HTTPS or platform-provided authentication. Skriuw encrypts user content with
its own key management, which is exactly the case the "non-exempt" answer
exists for. Declaring `false` to skip the questionnaire is a false statement on
a submission.

Setting either key requires an `ios.infoPlist` entry in `mobile/app.json`,
which Mobile 16 does not own.

### Questionnaire answers

| Question | Answer |
| --- | --- |
| Does your app use encryption? | Yes |
| Does it qualify for any of the exemptions in Category 5, Part 2? | Yes — the mass-market exemption |
| Which exemption? | (b) Your app uses, accesses, contains or implements encryption **and** it is limited to standard encryption algorithms, and it is available to the general public at no cost |
| Is your app designed for use with the U.S. government? | No |
| Has your app been classified by the U.S. government (CCATS)? | No |

### What that exemption still requires

Self-classifying under License Exception ENC, §740.17(b)(1) as mass market is
not the same as owing nothing. It carries an **annual self-classification
report** to BIS and the NSA, due by 1 February for the preceding calendar year,
listing the item. The source is public on GitHub, which is what makes the
mass-market reading straightforward; published open-source encryption source
code is separately handled under §742.15(b), and that notification (an email to
BIS and the NSA with the repository URL) is the cheapest way to put the source
side beyond argument. Do both once, then the App Store answer is a checkbox
each release.

France's separate import declaration for cryptographic means applies to
distribution there; Apple's questionnaire surfaces it as a France-specific
question on some accounts. Answer it from the same facts: standard algorithms,
freely available, no proprietary cryptography.

## Play Console

Google asks no encryption export question. The US Export Administration
Regulations still apply to the developer, not to the store, so the BIS
self-classification report above covers the Android distribution as well.

The Data safety form's **"Is all user data encrypted in transit?"** is a
different question and the answer is yes; it is filled in
[`privacy.md`](privacy.md).

## Before the first submission

1. File the §742.15(b) open-source notification for the repository (one email,
   one time).
2. File the annual self-classification report, or set a reminder for the first
   1 February after launch.
3. Add `ITSAppUsesNonExemptEncryption` to `mobile/app.json` under
   `ios.infoPlist`, so App Store Connect stops asking per build.
4. Record Apple's returned compliance code here once it is issued.
