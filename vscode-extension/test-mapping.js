/**
 * Test script to verify position mapping between original and transformed source
 */

const { transformSource } = require('./node_modules/effect-sugar-ts-plugin/transformer.js')

// Test content - simple gen block
const testContent = `const test = gen {
  user <- getUser(1);
  let name = user.name;
  return { user, name };
};`

console.log('=== Original Source ===')
console.log(testContent)
console.log('')

// Transform
const result = transformSource(testContent)

console.log('=== Transformed Source ===')
console.log(result.transformed)
console.log('')

console.log('=== Segments ===')
const segments = result.positionMapper.getSegments()
segments.forEach((seg, i) => {
  const origText = testContent.slice(seg.originalStart, seg.originalEnd)
  const transText = result.transformed.slice(seg.generatedStart, seg.generatedEnd)
  console.log(`Segment ${i} (${seg.type}):`)
  console.log(`  Original [${seg.originalStart}-${seg.originalEnd}]: "${origText}"`)
  console.log(`  Generated [${seg.generatedStart}-${seg.generatedEnd}]: "${transText}"`)
})
console.log('')

// Test specific positions
console.log('=== Position Mapping Tests ===')

// Find 'user' in original - should be after the newline and indent
const userPosOrig = testContent.indexOf('user <-')
console.log(`Position of 'user' in original: ${userPosOrig}`)
console.log(`Character at position: "${testContent[userPosOrig]}"`)

// Map to transformed
const userPosTrans = result.positionMapper.originalToTransformed(userPosOrig)
console.log(`Mapped to transformed: ${userPosTrans}`)
console.log(`Character at transformed position: "${result.transformed[userPosTrans]}"`)

// Check what the text looks like around that position
console.log(
  `Context in transformed (pos-5 to pos+10): "${result.transformed.slice(Math.max(0, userPosTrans - 5), userPosTrans + 10)}"`
)

// Find 'getUser' in original
const getUserPosOrig = testContent.indexOf('getUser(1)')
console.log(`\nPosition of 'getUser' in original: ${getUserPosOrig}`)
console.log(`Character at position: "${testContent[getUserPosOrig]}"`)

const getUserPosTrans = result.positionMapper.originalToTransformed(getUserPosOrig)
console.log(`Mapped to transformed: ${getUserPosTrans}`)
console.log(`Character at transformed position: "${result.transformed[getUserPosTrans]}"`)
console.log(
  `Context in transformed: "${result.transformed.slice(Math.max(0, getUserPosTrans - 5), getUserPosTrans + 15)}"`
)

// Test reverse mapping
console.log('\n=== Reverse Mapping Tests ===')
const constUserInTrans = result.transformed.indexOf('const user')
console.log(`Position of 'const user' in transformed: ${constUserInTrans}`)
const mappedBack = result.positionMapper.transformedToOriginal(constUserInTrans + 6) // position of 'user' after 'const '
console.log(`'user' position in transformed (const+6): ${constUserInTrans + 6}`)
console.log(`Mapped back to original: ${mappedBack}`)
console.log(`Character at original position: "${testContent[mappedBack]}"`)
