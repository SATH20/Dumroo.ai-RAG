import { checkAnswerCompleteness } from "../web/lib/completeness";

console.log("Case 1:", checkAnswerCompleteness("For a system, \\mathbf{F} represents the total *$."));
console.log("Case 2:", checkAnswerCompleteness("Internal forces are excluded [Physics Part 1, Ch]."));
console.log("Case 3 (valid):", checkAnswerCompleteness("Internal forces cancel out in pairs [Physics Part 1, Ch 4, p. 55]."));
console.log("Case 4 ($$ block):", checkAnswerCompleteness("Newton second law is given by:\n$$\\vec{F} = m\\vec{a}$$\nwhere $m$ is mass and $\\vec{a}$ is acceleration."));
console.log("Case 5 (marker):", checkAnswerCompleteness("[[COVERED]] Valid explanation [Physics Part 1, Ch 4, p. 55]."));
