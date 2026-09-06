# Bricriu: name, availability, and registration plan

> Preliminary naming and trademark notes, last checked 6 September 2026. This is practical project guidance, not legal advice or a formal trademark clearance opinion. Search results, fees, and availability can change.

## Recommendation

**Bricriu is a plausible and distinctive name for the project, but it is not yet “cleared” or registered.** The sensible route is to conduct a proper Canadian trademark search, reserve the useful online identifiers, and—if the search remains favourable—apply to register **BRICRIU** as a word mark for downloadable note-taking software.

Bricriu is a better choice than *Yolfad* if the aim is a genuinely different mythological identity: Yolfad is essentially a regional form of Olifat, whereas Bricriu belongs to the Irish Ulster Cycle.

## Who is Bricriu?

Bricriu (approximately **BRICK-roo**) is an eloquent troublemaker and instigator from early Irish literature, sometimes called “Bricriu of the Bitter Tongue.” In *Fled Bricrenn* (*Bricriu’s Feast*), he builds a feast hall and engineers rivalries among heroes.

That gives the name a useful connection to a writing app: words, wit, provocation, stories, and a little productive mischief. It also has drawbacks worth accepting consciously:

- Many people will not know how to pronounce or spell it.
- The mythological character is manipulative rather than benevolent.
- The name should be presented as borrowed from Irish tradition, not as an invented character that the project owns.

The ancient name and story are not yours to monopolize. A trademark would protect **Bricriu as a brand for specified goods or services in specified territories**, not ownership of the mythological figure or the word in every context.

## Preliminary collision check

A quick software-oriented search on 6 September 2026 found:

- no exact package named `bricriu` on npm, PyPI, or crates.io;
- three small GitHub repositories under a user named `bricriu`, but no established software product found under that name;
- a monster named Bricriu in the game *Orna*;
- a Bricriu beverage business in Italy; and
- an older fictional “Bricriu-class Corvette” reference.

These findings are encouraging, not conclusive. An unavailable or confusingly similar trademark need not be an exact match, appear in a package registry, or even be heavily advertised online. Common-law use may also matter. A professional clearance search could therefore reach a different conclusion.

## There is no single name registry

“Registering the name” consists of several independent steps:

1. **Trademark registration** protects the brand in particular markets and categories.
2. **Business or corporate-name registration** identifies a legal business; it does not provide the same protection as a trademark.
3. **Domains and account names** must be reserved separately.
4. **Package, application, and store identifiers** are controlled by their respective registries.

Owning `bricriu.com`, a GitHub organization, or a Canadian corporation called Bricriu does not by itself give you Canadian trademark rights. Conversely, a trademark registration does not automatically give you a domain or an existing account name.

## Proposed Canadian trademark plan

Canada is the logical first jurisdiction if the project is owned and launched from Canada. Trademark rights are territorial, so a Canadian registration would not automatically cover the United States, European Union, or the rest of the world.

### 1. Clear the name before a public launch

Search the [Canadian Trademarks Database](https://ised-isde.canada.ca/cipo/trademark-search/srch?lang=eng) for more than the exact spelling. Include:

- `BRICRIU`;
- likely misspellings and visually similar marks;
- phonetic forms such as `BRICKROO`; and
- similar marks used for software, writing, notes, knowledge management, productivity, and related services.

Review active and inactive records, word marks and design marks, and the goods/services attached to each result. Also search company names, app stores, package registries, GitHub, domains, general web results, and relevant French-language or phonetic variants. CIPO’s [database introduction](https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/introduction-canadian-trademarks-database) explains why variant searching matters.

CIPO does not clear the mark for you or provide legal advice. A Canadian trademark agent is worthwhile for a final clearance opinion, especially before investing in a public launch, artwork, or packaging.

### 2. Decide who owns the mark

Choose the applicant before filing:

- you personally; or
- a corporation that will own and license the project.

It is possible to transfer a trademark later, but choosing the intended long-term owner now avoids extra paperwork and ambiguity. Use the owner’s exact legal name and address in the application.

### 3. File the name as a word mark

The first application should normally be the standard-character word mark **BRICRIU**, rather than only a logo. That protects the name independently of a particular typeface or graphic treatment. A distinctive logo can be filed separately later if it becomes valuable enough to justify another application.

For the present downloadable desktop app, the likely starting point is **Nice Class 9**. A possible plain-language goods description is:

> Downloadable computer software for creating, editing, organizing, searching, previewing and storing notes and Markdown documents.

The exact wording should be checked against CIPO’s current Goods and Services Manual or reviewed by a trademark agent. The application should describe what the product genuinely is or will be; broad but inaccurate wording can cause objections.

If Bricriu later becomes an actual hosted software service, **Class 42** may also be appropriate, for example:

> Software as a service (SaaS) featuring software for creating, editing, organizing, searching, previewing and storing notes and electronic documents.

Do not add Class 42 merely because the repository, documentation, or download page is hosted online. The current desktop application may need only Class 9.

### 4. File with CIPO

Applications can be filed using [CIPO’s online trademark filing service](https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/file-new-or-amended-trademark-or-certification-mark-application).

As of 2026, CIPO lists an online filing fee of **CAD $491.06 for the first class**, plus **CAD $149.04 for each additional class**. Check the [current trademark fee schedule](https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/fees-trademarks) immediately before filing; fees change and filing fees are generally not refundable.

For the app in its present form, one Class 9 application is the likely minimum. Adding speculative classes increases both cost and the chance of avoidable complications.

### 5. Expect examination, not instant registration

Filing creates an application and filing date; it does not guarantee registration. CIPO checks formalities and examines the application. An examiner may object to the mark or the description of goods/services. If approved, the application is advertised in the *Trademarks Journal*, where others may oppose it. Registration follows only if the application completes that process successfully.

Processing times vary and should be checked on CIPO’s [application-process page](https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/how-your-trademark-application-processed). A Canadian registration generally lasts ten years and can be renewed.

### 6. Use the symbols correctly and preserve evidence

You may use **Bricriu™** while the mark is unregistered or pending. Use **Bricriu®** in Canada only after registration. Canadian law does not require either symbol, but consistent use can communicate that the name is being treated as a brand.

Keep dated evidence of genuine use, including:

- release and download pages;
- screenshots showing the name in the application;
- installer metadata and signed release files;
- website and documentation snapshots;
- announcements; and
- records showing when downloads or distributions began.

## Reserving the practical identifiers

After a satisfactory clearance search—and ideally immediately before filing or announcing the name—check and reserve the identifiers that will actually be used:

- GitHub organization and repository names;
- the main domain and any important defensive domains;
- social-media handles that matter to the project;
- application-store listing names;
- a stable Tauri application identifier, such as `ca.<owner>.bricriu` or `com.<owner>.bricriu`; and
- npm, crates.io, or PyPI package names only if the project will genuinely publish there.

Availability on these services is temporary until reserved. Do not publish empty packages merely to squat on registry names, and do not assume that securing an account or package resolves the trademark question.

## Relationship to the AGPL license

The project’s code is licensed under the [GNU Affero General Public License v3 or later](LICENSE). The AGPL and a Bricriu trademark serve different purposes:

- The **AGPL** governs copying, modification, distribution, and certain network use of the software.
- A **trademark** governs use of the Bricriu name and logo as indicators of origin.

The AGPL permits commercial use and sale. When someone conveys a covered modified version, the AGPL’s source-code and same-license obligations apply; its network-use provision also requires users interacting remotely with a modified version to be offered the Corresponding Source. It does not mean that every unrelated program used alongside Bricriu automatically becomes AGPL.

The code license does not require you to let a fork present itself as the official Bricriu product. A fork should be allowed to say truthfully that it is “based on Bricriu,” while confusing branding or false claims of endorsement can be restricted under trademark law.

Before a public release, add a `TRADEMARKS.md` policy. A reasonable starting notice is:

> Bricriu™ and the Bricriu logo are trademarks of [owner]. The source code is licensed under AGPL-3.0-or-later. That license does not grant permission to use the Bricriu trademarks except as reasonably necessary to describe the origin of the software. Modified distributions must not imply endorsement and should use a distinct name and branding.

Have the final policy reviewed before relying on it. It should permit honest referential use and community discussion, not overreach into attempts to control the ancient name in unrelated contexts.

## International protection

If the project gains users outside Canada, prioritize the markets that actually matter. Possible routes include direct applications in the United States or European Union and, when appropriate, an international application through the Madrid System. Each route has eligibility, classification, cost, and examination issues of its own; a Canadian trademark agent can advise on timing and whether a Canadian application or registration should form the basis of a broader filing strategy.

Do not spend heavily registering everywhere before the project has a credible release plan. The name should nevertheless be screened in major intended markets before a global announcement, because discovering a conflict after building recognition is expensive.

## Practical order of work

1. Confirm that **Bricriu** is the final spelling and that the pronunciation and character association are acceptable.
2. Decide whether you or a corporation will own the mark.
3. Commission or perform a careful Canadian clearance search, with a professional review if the name matters commercially.
4. Check the primary intended foreign markets and reserve the essential domain and account names.
5. File **BRICRIU** as a Canadian word mark, initially in Class 9 unless the real launch offering justifies more.
6. Begin consistent use of **Bricriu™** and preserve dated evidence.
7. Add `TRADEMARKS.md`, a short naming attribution in the README, and clear rules for branding modified builds.
8. Consider a separate logo application, Class 42, and foreign registrations only when the product and markets justify them.

## Bottom line

**Bricriu looks usable enough to justify formal clearance, but a preliminary internet and package search is not registration and not a guarantee.** If the professional search remains favourable, the cleanest initial strategy is a Canadian standard-character application for **BRICRIU** in Class 9, paired with the project’s AGPL-3.0-or-later code license and a separate, fair trademark policy.

Useful official references:

- [CIPO Trademarks Guide](https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/trademarks-guide)
- [Canadian Trademarks Database](https://ised-isde.canada.ca/cipo/trademark-search/srch?lang=eng)
- [CIPO online application information](https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/file-new-or-amended-trademark-or-certification-mark-application)
- [CIPO trademark fees](https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/fees-trademarks)
- [How CIPO processes an application](https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/how-your-trademark-application-processed)
- [CIPO trademark basics and symbols](https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademark-learn-basic/trademarks-learn-basics-protect-your-brand-learn-why-trademarks-matter)
- [University College Cork CELT: *Fled Bricrenn* text](https://celt.ucc.ie/published/G301900/text024.html)
- [Irish Texts Society: *Fled Bricrenn*](https://irishtextssociety.org/texts/FB/FledBricrenn-text.pdf)

