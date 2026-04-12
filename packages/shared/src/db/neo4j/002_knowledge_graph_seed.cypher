// Neo4j Knowledge Graph Seed Data
// Creates Subject nodes and sample KnowledgePoint nodes with relationships
// Requirements: 1.3, 17.2, 20.1

// ===== Create Subject Nodes =====

MERGE (chinese:Subject {name: 'chinese'})
SET chinese.displayName = '语文';

MERGE (math:Subject {name: 'math'})
SET math.displayName = '数学';

MERGE (english:Subject {name: 'english'})
SET english.displayName = '英语';

// ===== Sample KnowledgePoint Nodes (Math - Grade 3) =====

MERGE (add3:KnowledgePoint {id: 'math-3-addition'})
SET add3.name = '三位数加法',
    add3.subject = 'math',
    add3.grade = 3,
    add3.unit = '万以内的加法和减法',
    add3.category = '计算',
    add3.bloomLevels = ['remember', 'understand', 'apply'],
    add3.difficulty = 3;

MERGE (sub3:KnowledgePoint {id: 'math-3-subtraction'})
SET sub3.name = '三位数减法',
    sub3.subject = 'math',
    sub3.grade = 3,
    sub3.unit = '万以内的加法和减法',
    sub3.category = '计算',
    sub3.bloomLevels = ['remember', 'understand', 'apply'],
    sub3.difficulty = 3;

MERGE (mul3:KnowledgePoint {id: 'math-3-multiplication'})
SET mul3.name = '两位数乘一位数',
    mul3.subject = 'math',
    mul3.grade = 3,
    mul3.unit = '多位数乘一位数',
    mul3.category = '计算',
    mul3.bloomLevels = ['remember', 'understand', 'apply'],
    mul3.difficulty = 4;

MERGE (carry:KnowledgePoint {id: 'math-3-carry'})
SET carry.name = '进位与退位',
    carry.subject = 'math',
    carry.grade = 3,
    carry.unit = '万以内的加法和减法',
    carry.category = '计算基础',
    carry.bloomLevels = ['remember', 'understand'],
    carry.difficulty = 2;

// ===== Sample KnowledgePoint Nodes (Chinese - Grade 3) =====

MERGE (stroke:KnowledgePoint {id: 'chinese-3-stroke-order'})
SET stroke.name = '基本笔顺规则',
    stroke.subject = 'chinese',
    stroke.grade = 3,
    stroke.unit = '识字与写字',
    stroke.category = '书写',
    stroke.bloomLevels = ['remember', 'apply'],
    stroke.difficulty = 2;

MERGE (radical:KnowledgePoint {id: 'chinese-3-radicals'})
SET radical.name = '常用偏旁部首',
    radical.subject = 'chinese',
    radical.grade = 3,
    radical.unit = '识字与写字',
    radical.category = '识字',
    radical.bloomLevels = ['remember', 'understand'],
    radical.difficulty = 3;

MERGE (reading:KnowledgePoint {id: 'chinese-3-reading-comprehension'})
SET reading.name = '阅读理解基础',
    reading.subject = 'chinese',
    reading.grade = 3,
    reading.unit = '阅读',
    reading.category = '阅读理解',
    reading.bloomLevels = ['understand', 'analyze', 'evaluate'],
    reading.difficulty = 5;

// ===== Sample KnowledgePoint Nodes (English - Grade 3) =====

MERGE (phonics:KnowledgePoint {id: 'english-3-phonics'})
SET phonics.name = '自然拼读基础',
    phonics.subject = 'english',
    phonics.grade = 3,
    phonics.unit = 'Phonics',
    phonics.category = '语音',
    phonics.bloomLevels = ['remember', 'understand', 'apply'],
    phonics.difficulty = 3;

MERGE (vocab:KnowledgePoint {id: 'english-3-basic-vocabulary'})
SET vocab.name = '基础词汇',
    vocab.subject = 'english',
    vocab.grade = 3,
    vocab.unit = 'Vocabulary',
    vocab.category = '词汇',
    vocab.bloomLevels = ['remember', 'understand'],
    vocab.difficulty = 2;

// ===== Relationships: prerequisiteOf =====

// carry is prerequisite of addition and subtraction
MATCH (carry:KnowledgePoint {id: 'math-3-carry'})
MATCH (add3:KnowledgePoint {id: 'math-3-addition'})
MERGE (carry)-[:PREREQUISITE_OF]->(add3);

MATCH (carry:KnowledgePoint {id: 'math-3-carry'})
MATCH (sub3:KnowledgePoint {id: 'math-3-subtraction'})
MERGE (carry)-[:PREREQUISITE_OF]->(sub3);

// addition is prerequisite of multiplication
MATCH (add3:KnowledgePoint {id: 'math-3-addition'})
MATCH (mul3:KnowledgePoint {id: 'math-3-multiplication'})
MERGE (add3)-[:PREREQUISITE_OF]->(mul3);

// stroke order is prerequisite of radicals
MATCH (stroke:KnowledgePoint {id: 'chinese-3-stroke-order'})
MATCH (radical:KnowledgePoint {id: 'chinese-3-radicals'})
MERGE (stroke)-[:PREREQUISITE_OF]->(radical);

// phonics is prerequisite of vocabulary
MATCH (phonics:KnowledgePoint {id: 'english-3-phonics'})
MATCH (vocab:KnowledgePoint {id: 'english-3-basic-vocabulary'})
MERGE (phonics)-[:PREREQUISITE_OF]->(vocab);

// ===== Relationships: relatedTo =====

// addition and subtraction are related
MATCH (add3:KnowledgePoint {id: 'math-3-addition'})
MATCH (sub3:KnowledgePoint {id: 'math-3-subtraction'})
MERGE (add3)-[:RELATED_TO]->(sub3);

// stroke order and radicals are related
MATCH (stroke:KnowledgePoint {id: 'chinese-3-stroke-order'})
MATCH (radical:KnowledgePoint {id: 'chinese-3-radicals'})
MERGE (stroke)-[:RELATED_TO]->(radical);

// ===== Relationships: crossSubjectLink =====

// Math counting relates to English number vocabulary
MATCH (add3:KnowledgePoint {id: 'math-3-addition'})
MATCH (vocab:KnowledgePoint {id: 'english-3-basic-vocabulary'})
MERGE (add3)-[:CROSS_SUBJECT_LINK {linkType: '数学运算与英语数字词汇', description: '加法运算中的数字概念与英语数字单词学习相互关联'}]->(vocab);

// Chinese reading comprehension relates to math word problems
MATCH (reading:KnowledgePoint {id: 'chinese-3-reading-comprehension'})
MATCH (add3:KnowledgePoint {id: 'math-3-addition'})
MERGE (reading)-[:CROSS_SUBJECT_LINK {linkType: '阅读理解与应用题审题', description: '语文阅读理解能力有助于数学应用题的审题和信息提取'}]->(add3);

// ===== Relationships: belongsTo (Subject) =====

MATCH (kp:KnowledgePoint) WHERE kp.subject = 'math'
MATCH (s:Subject {name: 'math'})
MERGE (kp)-[:BELONGS_TO]->(s);

MATCH (kp:KnowledgePoint) WHERE kp.subject = 'chinese'
MATCH (s:Subject {name: 'chinese'})
MERGE (kp)-[:BELONGS_TO]->(s);

MATCH (kp:KnowledgePoint) WHERE kp.subject = 'english'
MATCH (s:Subject {name: 'english'})
MERGE (kp)-[:BELONGS_TO]->(s);
