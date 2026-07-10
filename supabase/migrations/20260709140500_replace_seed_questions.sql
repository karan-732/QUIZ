-- Replace placeholder seed questions with the real question bank
-- sourced from kahoot_questions2.pdf (shortened wording, 30s per question).
delete from questions;

insert into questions
  (question_text, option_a, option_b, option_c, option_d, correct_option, time_limit_seconds, display_order)
values
  (
    'An AI Intern keeps getting return policy exceptions wrong. What is most likely missing?',
    'A better system prompt with a friendlier tone',
    'It should be single-purpose, not multi-purpose',
    'The exceptions document is not in its knowledge base, so it guesses',
    'It needs to move from Chat to Co-work',
    'C', 30, 1
  ),
  (
    'Your HR team will screen resumes with the same rubric every day. Where should you build the assistant?',
    'A normal chat, since Claude remembers recent messages',
    'A Project, with persistent instructions and knowledge files',
    'A new chat every morning, pasting the SOP manually',
    'One shared chat link everyone reuses forever',
    'B', 30, 2
  ),
  (
    'You have 15 minutes to get Claude to build an elite, customized 5-year growth strategy. What works best?',
    'Paste a 50-page industry report and ask it to adapt it',
    'Write a 3-page company backstory and ask for a plan',
    'Use a CRAFT prompt with your role, goals, and format',
    'Ask it to act as a McKinsey partner and interview you one question at a time, then build the strategy',
    'D', 30, 3
  ),
  (
    'You paste a sensitive vendor agreement into a free AI chat, then delete the chat 10 seconds later. What happens to the data?',
    'It is instantly wiped from the backend servers',
    'It is encrypted and only readable by government request',
    'It stays in backend logs up to 30 days and may train future models unless you opted out',
    'The AI flags it as a contract and self-destructs the data',
    'C', 30, 4
  ),
  (
    'A company used AI to map supply chain risks five layers deep and predicted a factory shutdown before its supplier even reported it. How?',
    'It analyzed the supplier''s historical shipping data for patterns',
    'It made all sub-suppliers fill out risk compliance forms',
    'It scanned millions of public data points like local news, weather alerts, and customs filings',
    'It plugged into the supplier''s inventory software in real time',
    'C', 30, 5
  );
