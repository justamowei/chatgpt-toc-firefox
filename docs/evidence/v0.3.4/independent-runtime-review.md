# Independent saved-order review

Source commit: a1ff15a7535cb7bf08cff683ff69104be17f1efb

94/94 current pure tests passed; typecheck, production/fixture build and both strict lints passed. All twelve output hashes match the primary build, its build-info and actual files. Native Firefox 157.0.1 report has 8/8 PASS and matching fixture hashes; reviewed without launching a browser.

The runtime change separates saved ordering from recovered identity confirmation and explicitly keeps recovery IDs out of completeness proofs. Storage version 1 is unchanged. Existing contradiction isolation remains.

Native V034-03 asserts no groups and saved order after F5. V034-07 asserts exact order and no groups for three refreshes before scrolling. V034-08 asserts exact order and no groups while an SPA mount is empty. V034-02 ordinary A to B to A currently verifies counts and exact navigation, but should directly assert ordered IDs, no groups and saved-order scope.

Limitations: no independent native browser run, ChatGPT LIVE, private Firefox, installation, signing or AMO validation. Existing partial graph serialization remains outside this minimal fix.
