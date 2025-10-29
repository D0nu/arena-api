// Enhanced Question Generator with Multiple APIs and Randomization
import axios from 'axios';

// ==================== UTILITY FUNCTIONS ====================

function decodeHTML(html) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&lsquo;': "'",
    '&rsquo;': "'",
    '&nbsp;': ' ',
    '&hellip;': '...'
  };
  
  return html.replace(/&[^;]+;/g, match => entities[match] || match);
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Randomize question options and update correct answer index
function randomizeQuestion(question) {
  const { options, correctAnswer, ...rest } = question;
  
  // If correctAnswer is already a string (from API), find its index first
  let correctOption;
  if (typeof correctAnswer === 'string') {
    correctOption = correctAnswer;
  } else {
    correctOption = options[correctAnswer];
  }
  
  // Shuffle options
  const shuffledOptions = shuffleArray(options);
  
  // Find new index of correct answer
  const newCorrectAnswer = shuffledOptions.indexOf(correctOption);
  
  return {
    ...rest,
    options: shuffledOptions,
    correctAnswer: newCorrectAnswer
  };
}

// ==================== API FETCHING ====================

export default async function generateQuestions(topic, count = 15) {
  try {
    console.log(`📚 Generating ${count} questions for topic: ${topic}`);
    
    // Try Open Trivia Database first
    const apiQuestions = await fetchFromOpenTDB(topic, count);
    
    if (apiQuestions && apiQuestions.length >= count) {
      console.log(`✅ Successfully fetched ${apiQuestions.length} questions from API`);
      return shuffleArray(apiQuestions).slice(0, count).map(randomizeQuestion);
    }
    
    // Fallback to local questions if API fails or returns insufficient questions
    console.log('🔄 Using enhanced local question bank');
    return getLocalQuestions(topic, count);
    
  } catch (error) {
    console.error('❌ API error:', error.message);
    console.log('🔄 Using enhanced local question bank');
    return getLocalQuestions(topic, count);
  }
}

async function fetchFromOpenTDB(topic, count) {
  try {
    // Map topics to OpenTDB categories
    const categoryMap = {
      'solana': 18,   // Science: Computers (closest match)
      'music': 12,    // Entertainment: Music
      'sports': 21,   // Sports
      'movies': 11,   // Entertainment: Film
      'history': 23,  // History
      'fashion': 9    // General Knowledge (no fashion category)
    };

    const categoryId = categoryMap[topic] || 9;
    
    // OpenTDB limits to 50 questions per request
    const requestCount = Math.min(count, 50);
    
    const response = await axios.get(
      `https://opentdb.com/api.php?amount=${requestCount}&category=${categoryId}&type=multiple`,
      { timeout: 5000 }
    );
    
    if (response.data.response_code !== 0) {
      throw new Error('OpenTDB API returned error code: ' + response.data.response_code);
    }

    return response.data.results.map((q, index) => ({
      id: Date.now() + index,
      question: decodeHTML(q.question),
      options: shuffleArray([...q.incorrect_answers.map(decodeHTML), decodeHTML(q.correct_answer)]),
      correctAnswer: decodeHTML(q.correct_answer), // Will be converted to index in randomizeQuestion
      difficulty: q.difficulty,
      topic: topic
    }));

  } catch (error) {
    console.error('OpenTDB fetch failed:', error.message);
    return null;
  }
}

// ==================== LOCAL QUESTION BANK (50+ per topic) ====================

function getLocalQuestions(topic, count) {
  const questions = QUESTION_BANK[topic] || QUESTION_BANK.solana;
  
  // Shuffle and select questions
  const selected = shuffleArray(questions).slice(0, count);
  
  // Randomize options for each question
  return selected.map(randomizeQuestion);
}

const QUESTION_BANK = {
  solana: [
    // Easy (20 questions)
    { question: "What is the native token of the Solana blockchain?", options: ["SOL", "ETH", "BTC", "ADA"], correctAnswer: 0, difficulty: "easy" },
    { question: "Which wallet is commonly used for Solana?", options: ["MetaMask", "Phantom", "Trust Wallet", "Coinbase Wallet"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which company developed Solana?", options: ["Solana Labs", "Ethereum Foundation", "Binance", "Coinbase"], correctAnswer: 0, difficulty: "easy" },
    { question: "Which of these is NOT a Solana DEX?", options: ["Orca", "Raydium", "Jupiter", "Uniswap"], correctAnswer: 3, difficulty: "easy" },
    { question: "What is the typical transaction fee on Solana?", options: ["Around $0.00025", "Around $0.01", "Around $1", "Around $5"], correctAnswer: 0, difficulty: "easy" },
    { question: "Which is the official Solana documentation site?", options: ["docs.solana.com", "solana.docs", "solana.io/docs", "solana-docs.com"], correctAnswer: 0, difficulty: "easy" },
    { question: "What is the Solana Foundation's role?", options: ["Supporting the ecosystem", "Mining SOL", "Controlling the network", "Setting gas prices"], correctAnswer: 0, difficulty: "easy" },
    { question: "What is Serum DEX built on?", options: ["Solana", "Ethereum", "BSC", "Polygon"], correctAnswer: 0, difficulty: "easy" },
    { question: "What is Sollet?", options: ["A Solana wallet", "A DEX", "A bridge", "A staking platform"], correctAnswer: 0, difficulty: "easy" },
    { question: "Which hackathon series is famous in Solana?", options: ["Solana Hackathon", "ETHGlobal", "Chainlink Hackathon", "Polygon Hackathon"], correctAnswer: 0, difficulty: "easy" },
    { question: "What does SOL stand for?", options: ["Solana", "Solar", "Solution", "Solid"], correctAnswer: 0, difficulty: "easy" },
    { question: "Is Solana a blockchain platform?", options: ["Yes", "No", "Only for NFTs", "Only for DeFi"], correctAnswer: 0, difficulty: "easy" },
    { question: "Which of these can you build on Solana?", options: ["NFTs", "DeFi apps", "Games", "All of the above"], correctAnswer: 3, difficulty: "easy" },
    { question: "What color is the Solana logo primarily?", options: ["Blue", "Purple and teal", "Red", "Green"], correctAnswer: 1, difficulty: "easy" },
    { question: "Is Solana known for high transaction speeds?", options: ["Yes", "No", "Only sometimes", "Slower than Bitcoin"], correctAnswer: 0, difficulty: "easy" },
    { question: "Can you stake SOL tokens?", options: ["Yes", "No", "Only on Ethereum", "Only through banks"], correctAnswer: 0, difficulty: "easy" },
    { question: "What type of network is Solana?", options: ["Layer 1 blockchain", "Layer 2 solution", "Sidechain", "Private network"], correctAnswer: 0, difficulty: "easy" },
    { question: "Does Solana support smart contracts?", options: ["Yes", "No", "Only NFTs", "Only payments"], correctAnswer: 0, difficulty: "easy" },
    { question: "Which year was Solana founded?", options: ["2017", "2018", "2019", "2020"], correctAnswer: 0, difficulty: "easy" },
    { question: "Is Solana open-source?", options: ["Yes", "No", "Partially", "Only for validators"], correctAnswer: 0, difficulty: "easy" },

    // Medium (20 questions)
    { question: "Which year was Solana mainnet launched?", options: ["2018", "2019", "2020", "2021"], correctAnswer: 2, difficulty: "medium" },
    { question: "Who is the founder of Solana?", options: ["Vitalik Buterin", "Anatoly Yakovenko", "Charles Hoskinson", "Gavin Wood"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which programming language is primarily used for Solana smart contracts?", options: ["Solidity", "Vyper", "Rust", "C++"], correctAnswer: 2, difficulty: "medium" },
    { question: "What is the name of Solana's token standard similar to ERC-20?", options: ["SPL", "SOL-20", "SLT", "S-Token"], correctAnswer: 0, difficulty: "medium" },
    { question: "What is the name of Solana's decentralized exchange aggregator?", options: ["Uniswap", "Jupiter", "Serum", "Raydium"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which NFT marketplace is native to Solana?", options: ["OpenSea", "Magic Eden", "Rarible", "Foundation"], correctAnswer: 1, difficulty: "medium" },
    { question: "What is Anchor in the Solana ecosystem?", options: ["A framework for building smart contracts", "A wallet", "A DEX", "A bridge"], correctAnswer: 0, difficulty: "medium" },
    { question: "What is Wormhole in relation to Solana?", options: ["A cross-chain bridge", "A scaling solution", "A wallet", "A consensus mechanism"], correctAnswer: 0, difficulty: "medium" },
    { question: "How many validators does Solana typically have?", options: ["Over 1,000", "Less than 100", "Exactly 500", "Over 10,000"], correctAnswer: 0, difficulty: "medium" },
    { question: "What is Metaplex used for on Solana?", options: ["Creating NFTs", "Staking SOL", "Trading tokens", "Bridging assets"], correctAnswer: 0, difficulty: "medium" },
    { question: "What does RPC stand for in Solana?", options: ["Remote Procedure Call", "Rapid Processing Center", "Random Protocol Chain", "Real-time Payment Channel"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which feature allows Solana to timestamp transactions?", options: ["Proof of History", "Tower BFT", "Gulf Stream", "Turbine"], correctAnswer: 0, difficulty: "medium" },
    { question: "What is Solana Beach?", options: ["A blockchain explorer", "A wallet", "A DEX", "A gaming platform"], correctAnswer: 0, difficulty: "medium" },
    { question: "What is Solana Pay?", options: ["A payment protocol", "A wallet", "A DEX", "A staking service"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which network had a major outage in September 2021?", options: ["Solana", "Ethereum", "Bitcoin", "Cardano"], correctAnswer: 0, difficulty: "medium" },
    { question: "What is Marinade Finance?", options: ["A liquid staking protocol", "A DEX", "A lending platform", "A bridge"], correctAnswer: 0, difficulty: "medium" },
    { question: "What does SPL stand for?", options: ["Solana Program Library", "Solana Protocol Layer", "Smart Program Language", "Solana Payment Link"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which feature makes Solana different from Ethereum?", options: ["No mempool", "Has smart contracts", "Uses validators", "Has a native token"], correctAnswer: 0, difficulty: "medium" },
    { question: "What is Step Finance?", options: ["A portfolio tracker", "A wallet", "A DEX", "A bridge"], correctAnswer: 0, difficulty: "medium" },
    { question: "What is the Solana Mobile Stack?", options: ["SDK for mobile dApps", "A mobile wallet", "A hardware wallet", "A mobile game"], correctAnswer: 0, difficulty: "medium" },

    // Hard (10 questions)
    { question: "What consensus mechanism does Solana use?", options: ["Proof of Work", "Proof of Stake", "Proof of History", "Delegated Proof of Stake"], correctAnswer: 2, difficulty: "hard" },
    { question: "What is the approximate TPS (Transactions Per Second) of Solana?", options: ["1,000", "10,000", "50,000", "65,000+"], correctAnswer: 3, difficulty: "hard" },
    { question: "Which of these is a key feature of Solana's architecture?", options: ["Tower BFT", "Plasma", "zk-SNARKs", "Sharding"], correctAnswer: 0, difficulty: "hard" },
    { question: "What is Solana's block time approximately?", options: ["400 milliseconds", "1 second", "10 seconds", "30 seconds"], correctAnswer: 0, difficulty: "hard" },
    { question: "Which protocol helps Solana achieve high throughput?", options: ["Gulf Stream", "Plasma", "Rollups", "Sidechains"], correctAnswer: 0, difficulty: "hard" },
    { question: "What is Turbine in Solana?", options: ["A block propagation protocol", "A wallet", "A DEX", "A staking pool"], correctAnswer: 0, difficulty: "hard" },
    { question: "What does Sealevel enable in Solana?", options: ["Parallel transaction processing", "Faster consensus", "Lower fees", "Better security"], correctAnswer: 0, difficulty: "hard" },
    { question: "What is the minimum SOL required to create an account?", options: ["0.00089088 SOL", "0.001 SOL", "0.01 SOL", "0.1 SOL"], correctAnswer: 0, difficulty: "hard" },
    { question: "What is the inflation rate of SOL?", options: ["Decreasing over time", "Fixed at 5%", "Increasing over time", "Zero"], correctAnswer: 0, difficulty: "hard" },
    { question: "Which consensus does Tower BFT optimize?", options: ["PBFT", "PoW", "PoA", "DPoS"], correctAnswer: 0, difficulty: "hard" }
  ],

  music: [
    // Easy (20 questions)
    { question: "Who is known as the King of Pop?", options: ["Michael Jackson", "Elvis Presley", "Prince", "Madonna"], correctAnswer: 0, difficulty: "easy" },
    { question: "Which instrument has 88 keys?", options: ["Guitar", "Violin", "Piano", "Organ"], correctAnswer: 2, difficulty: "easy" },
    { question: "Which of these is a woodwind instrument?", options: ["Trumpet", "Violin", "Flute", "Drum"], correctAnswer: 2, difficulty: "easy" },
    { question: "Which composer went deaf later in life?", options: ["Mozart", "Beethoven", "Bach", "Chopin"], correctAnswer: 1, difficulty: "easy" },
    { question: "What does BPM stand for in music?", options: ["Beats Per Minute", "Bass Per Measure", "Beat Pattern Mode", "Bass Pitch Modulation"], correctAnswer: 0, difficulty: "easy" },
    { question: "Which band wrote 'Bohemian Rhapsody'?", options: ["Led Zeppelin", "Queen", "The Who", "Deep Purple"], correctAnswer: 1, difficulty: "easy" },
    { question: "How many strings does a standard guitar have?", options: ["4", "5", "6", "7"], correctAnswer: 2, difficulty: "easy" },
    { question: "What does 'forte' mean in music?", options: ["Soft", "Loud", "Fast", "Slow"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which rapper's real name is Marshall Mathers?", options: ["Jay-Z", "Eminem", "Drake", "Kanye West"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which pop star is known as 'The Material Girl'?", options: ["Cher", "Madonna", "Cyndi Lauper", "Janet Jackson"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which band is Freddie Mercury associated with?", options: ["The Beatles", "Queen", "Led Zeppelin", "The Rolling Stones"], correctAnswer: 1, difficulty: "easy" },
    { question: "What is a capella?", options: ["Instrumental music", "Singing without instruments", "A type of dance", "A musical key"], correctAnswer: 1, difficulty: "easy" },
    { question: "Who wrote 'Für Elise'?", options: ["Mozart", "Beethoven", "Chopin", "Liszt"], correctAnswer: 1, difficulty: "easy" },
    { question: "What does 'piano' mean in music notation?", options: ["Soft", "Loud", "Fast", "Slow"], correctAnswer: 0, difficulty: "easy" },
    { question: "Which band released 'Hotel California'?", options: ["Fleetwood Mac", "The Eagles", "Lynyrd Skynyrd", "The Doors"], correctAnswer: 1, difficulty: "easy" },
    { question: "What is the national instrument of Scotland?", options: ["Violin", "Bagpipes", "Harp", "Accordion"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which band had the hit 'Stairway to Heaven'?", options: ["Deep Purple", "Led Zeppelin", "Black Sabbath", "Pink Floyd"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which country is known as the birthplace of jazz?", options: ["United States", "France", "Cuba", "Brazil"], correctAnswer: 0, difficulty: "easy" },
    { question: "What does DJ stand for?", options: ["Digital Jockey", "Disc Jockey", "Dance Juggler", "Dynamic Jammer"], correctAnswer: 1, difficulty: "easy" },
    { question: "In tennis, what is a zero score called?", options: ["Nil", "Zero", "Love", "Null"], correctAnswer: 2, difficulty: "easy" },

    // Medium (20 questions)
    { question: "Which band released the album 'The Dark Side of the Moon'?", options: ["The Beatles", "Led Zeppelin", "Pink Floyd", "Queen"], correctAnswer: 2, difficulty: "medium" },
    { question: "Who composed the 'Moonlight Sonata'?", options: ["Mozart", "Beethoven", "Bach", "Chopin"], correctAnswer: 1, difficulty: "medium" },
    { question: "What is the term for the speed of a piece of music?", options: ["Dynamics", "Tempo", "Pitch", "Rhythm"], correctAnswer: 1, difficulty: "medium" },
    { question: "What year did the Beatles break up?", options: ["1967", "1970", "1973", "1975"], correctAnswer: 1, difficulty: "medium" },
    { question: "What is the highest female singing voice?", options: ["Alto", "Soprano", "Mezzo-Soprano", "Contralto"], correctAnswer: 1, difficulty: "medium" },
    { question: "Who is known as the 'Queen of Soul'?", options: ["Diana Ross", "Aretha Franklin", "Whitney Houston", "Etta James"], correctAnswer: 1, difficulty: "medium" },
    { question: "What is the lowest male singing voice called?", options: ["Tenor", "Baritone", "Bass", "Alto"], correctAnswer: 2, difficulty: "medium" },
    { question: "Which instrument is Yo-Yo Ma famous for playing?", options: ["Violin", "Cello", "Piano", "Flute"], correctAnswer: 1, difficulty: "medium" },
    { question: "What is a musical staff?", options: ["A group of musicians", "Five lines for notation", "A conducting baton", "A type of instrument"], correctAnswer: 1, difficulty: "medium" },
    { question: "How many notes are in an octave?", options: ["7", "8", "10", "12"], correctAnswer: 3, difficulty: "medium" },
    { question: "Which country is the origin of reggae music?", options: ["Cuba", "Jamaica", "Trinidad", "Haiti"], correctAnswer: 1, difficulty: "medium" },
    { question: "Who composed 'The Four Seasons'?", options: ["Bach", "Vivaldi", "Mozart", "Handel"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which instrument is NOT in the brass family?", options: ["Trumpet", "Trombone", "Tuba", "Saxophone"], correctAnswer: 3, difficulty: "medium" },
    { question: "Who is known as 'The Boss'?", options: ["Bob Dylan", "Bruce Springsteen", "Tom Petty", "Billy Joel"], correctAnswer: 1, difficulty: "medium" },
    { question: "How many valves does a standard trumpet have?", options: ["2", "3", "4", "5"], correctAnswer: 1, difficulty: "medium" },
    { question: "What genre is Miles Davis associated with?", options: ["Rock", "Jazz", "Classical", "Country"], correctAnswer: 1, difficulty: "medium" },
    { question: "What is the musical term for gradually getting louder?", options: ["Diminuendo", "Crescendo", "Fortissimo", "Pianissimo"], correctAnswer: 1, difficulty: "medium" },
    { question: "Who is the best-selling female artist of all time?", options: ["Celine Dion", "Madonna", "Mariah Carey", "Whitney Houston"], correctAnswer: 1, difficulty: "medium" },
    { question: "What does 'allegro' mean?", options: ["Slow", "Fast", "Medium tempo", "Very slow"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which musical has the song 'Memory'?", options: ["Phantom of the Opera", "Cats", "Les Misérables", "Chicago"], correctAnswer: 1, difficulty: "medium" },

    // Hard (10 questions)
    { question: "What is the highest-selling album of all time?", options: ["Thriller", "Back in Black", "The Dark Side of the Moon", "Their Greatest Hits"], correctAnswer: 0, difficulty: "hard" },
    { question: "Who sang 'Like a Rolling Stone'?", options: ["The Rolling Stones", "Bob Dylan", "The Beatles", "Elvis Presley"], correctAnswer: 1, difficulty: "hard" },
    { question: "Which key has no sharps or flats?", options: ["C Major", "G Major", "F Major", "D Major"], correctAnswer: 0, difficulty: "hard" },
    { question: "What is the treble clef also called?", options: ["F clef", "G clef", "C clef", "A clef"], correctAnswer: 1, difficulty: "hard" },
    { question: "How many symphonies did Beethoven compose?", options: ["7", "9", "11", "13"], correctAnswer: 1, difficulty: "hard" },
    { question: "What is a musical interval of eight notes called?", options: ["Scale", "Octave", "Chord", "Harmony"], correctAnswer: 1, difficulty: "hard" },
    { question: "Who is known as the 'Godfather of Soul'?", options: ["Marvin Gaye", "James Brown", "Stevie Wonder", "Ray Charles"], correctAnswer: 1, difficulty: "hard" },
    { question: "What is the pick used to play a guitar called?", options: ["Plectrum", "Bow", "Mallet", "Stick"], correctAnswer: 0, difficulty: "hard" },
    { question: "Who wrote the opera 'The Magic Flute'?", options: ["Verdi", "Mozart", "Wagner", "Puccini"], correctAnswer: 1, difficulty: "hard" },
    { question: "Which rapper had an album called 'The Marshall Mathers LP'?", options: ["Snoop Dogg", "Eminem", "Dr. Dre", "50 Cent"], correctAnswer: 1, difficulty: "hard" }
  ],

  sports: [
    // Easy (20 questions)
    { question: "How many players are on a soccer team?", options: ["9", "10", "11", "12"], correctAnswer: 2, difficulty: "easy" },
    { question: "In tennis, what is a zero score called?", options: ["Nil", "Zero", "Love", "Null"], correctAnswer: 2, difficulty: "easy" },
    { question: "How many periods are in an ice hockey game?", options: ["2", "3", "4", "5"], correctAnswer: 1, difficulty: "easy" },
    { question: "In baseball, how many strikes make an out?", options: ["2", "3", "4", "5"], correctAnswer: 1, difficulty: "easy" },
    { question: "How many players are on a baseball team defensively?", options: ["8", "9", "10", "11"], correctAnswer: 1, difficulty: "easy" },
    { question: "How many points is a touchdown worth in American football?", options: ["3", "6", "7", "8"], correctAnswer: 1, difficulty: "easy" },
    { question: "What sport is played at Wimbledon?", options: ["Golf", "Tennis", "Cricket", "Badminton"], correctAnswer: 1, difficulty: "easy" },
    { question: "How many holes are played in a standard round of golf?", options: ["9", "12", "18", "24"], correctAnswer: 2, difficulty: "easy" },
    { question: "What is the maximum number of players on a basketball court per team?", options: ["4", "5", "6", "7"], correctAnswer: 1, difficulty: "easy" },
    { question: "In which sport do you use a shuttlecock?", options: ["Tennis", "Badminton", "Squash", "Table Tennis"], correctAnswer: 1, difficulty: "easy" },
    { question: "How many innings are in a standard baseball game?", options: ["7", "9", "11", "12"], correctAnswer: 1, difficulty: "easy" },
    { question: "What color is the center of an archery target?", options: ["Red", "Yellow", "Blue", "Green"], correctAnswer: 1, difficulty: "easy" },
    { question: "In soccer, how many players can be on the field per team?", options: ["9", "10", "11", "12"], correctAnswer: 2, difficulty: "easy" },
    { question: "What sport uses a puck?", options: ["Field hockey", "Ice hockey", "Lacrosse", "Polo"], correctAnswer: 1, difficulty: "easy" },
    { question: "How many points is a field goal worth in basketball?", options: ["1", "2", "3", "Depends on distance"], correctAnswer: 3, difficulty: "easy" },
    { question: "What is the term for zero points in tennis?", options: ["Zero", "Nil", "Love", "Duck"], correctAnswer: 2, difficulty: "easy" },
    { question: "Which sport features the terms 'strike' and 'spare'?", options: ["Baseball", "Bowling", "Cricket", "Golf"], correctAnswer: 1, difficulty: "easy" },
    { question: "What is the highest belt color in karate?", options: ["Red", "Brown", "Black", "White"], correctAnswer: 2, difficulty: "easy" },
    { question: "In which sport would you perform a slam dunk?", options: ["Volleyball", "Basketball", "Tennis", "Handball"], correctAnswer: 1, difficulty: "easy" },
    { question: "How many sets do you need to win a men's Grand Slam tennis match?", options: ["2", "3", "4", "5"], correctAnswer: 1, difficulty: "easy" },

    // Medium (20 questions)
    { question: "Which country won the 2022 FIFA World Cup?", options: ["Brazil", "France", "Argentina", "Germany"], correctAnswer: 2, difficulty: "medium" },
    { question: "Which athlete has the most Olympic gold medals?", options: ["Usain Bolt", "Michael Phelps", "Carl Lewis", "Larisa Latynina"], correctAnswer: 1, difficulty: "medium" },
    { question: "What is the length of a marathon in miles?", options: ["24.2", "25.0", "26.2", "27.5"], correctAnswer: 2, difficulty: "medium" },
    { question: "Which boxer was known as 'The Greatest'?", options: ["Mike Tyson", "Muhammad Ali", "Sugar Ray Leonard", "Joe Frazier"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which country invented the sport of basketball?", options: ["Canada", "United States", "England", "Australia"], correctAnswer: 1, difficulty: "medium" },
    { question: "What year were the first modern Olympics held?", options: ["1892", "1896", "1900", "1904"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which golfer has won the most Masters tournaments?", options: ["Tiger Woods", "Jack Nicklaus", "Arnold Palmer", "Gary Player"], correctAnswer: 1, difficulty: "medium" },
    { question: "In which sport would you perform a 'Fosbury Flop'?", options: ["Gymnastics", "High jump", "Pole vault", "Long jump"], correctAnswer: 1, difficulty: "medium" },
    { question: "What is the only country to have played in every World Cup?", options: ["Argentina", "Brazil", "Germany", "Italy"], correctAnswer: 1, difficulty: "medium" },
    { question: "How long is an Olympic swimming pool in meters?", options: ["25", "50", "75", "100"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which tennis player has won the most Grand Slam titles (men)?", options: ["Roger Federer", "Rafael Nadal", "Novak Djokovic", "Pete Sampras"], correctAnswer: 2, difficulty: "medium" },
    { question: "What is the national sport of Canada?", options: ["Ice hockey", "Lacrosse", "Both A and B", "Soccer"], correctAnswer: 2, difficulty: "medium" },
    { question: "In which year did Roger Bannister break the 4-minute mile?", options: ["1952", "1954", "1956", "1958"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which NBA team has won the most championships?", options: ["Lakers", "Celtics", "Bulls", "Warriors"], correctAnswer: 1, difficulty: "medium" },
        { question: "What is the maximum weight for boxing heavyweight class?", options: ["200 lbs", "No upper limit", "250 lbs", "Unlimited"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which country has won the most Rugby World Cups?", options: ["New Zealand", "South Africa", "Australia", "England"], correctAnswer: 1, difficulty: "medium" },
    { question: "What is the diameter of a basketball hoop in inches?", options: ["16", "18", "20", "24"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which Formula 1 driver has the most championships?", options: ["Michael Schumacher", "Lewis Hamilton", "Juan Manuel Fangio", "Ayrton Senna"], correctAnswer: 1, difficulty: "medium" },
    { question: "What is the term for three consecutive strikes in bowling?", options: ["Turkey", "Triple", "Hat-trick", "Three-peat"], correctAnswer: 0, difficulty: "medium" },

    // Hard (10 questions)
    { question: "Which boxer retired with an undefeated record of 49-0?", options: ["Rocky Marciano", "Floyd Mayweather Jr.", "Muhammad Ali", "Mike Tyson"], correctAnswer: 1, difficulty: "hard" },
    { question: "What is the maximum break possible in snooker?", options: ["147", "155", "167", "180"], correctAnswer: 0, difficulty: "hard" },
    { question: "Which country has won the most Olympic gold medals overall?", options: ["United States", "Soviet Union", "China", "Great Britain"], correctAnswer: 0, difficulty: "hard" },
    { question: "What is the distance between the wickets in cricket?", options: ["20 yards", "22 yards", "24 yards", "26 yards"], correctAnswer: 1, difficulty: "hard" },
    { question: "Which NBA player scored 100 points in a single game?", options: ["Wilt Chamberlain", "Michael Jordan", "Kobe Bryant", "LeBron James"], correctAnswer: 0, difficulty: "hard" },
    { question: "What is the weight of an Olympic discus for men?", options: ["1 kg", "2 kg", "3 kg", "4 kg"], correctAnswer: 1, difficulty: "hard" },
    { question: "Which tennis tournament is played on clay courts?", options: ["Wimbledon", "US Open", "French Open", "Australian Open"], correctAnswer: 2, difficulty: "hard" },
    { question: "What year was the first Super Bowl held?", options: ["1965", "1967", "1969", "1971"], correctAnswer: 1, difficulty: "hard" },
    { question: "Which country has hosted the Summer Olympics three times?", options: ["United States", "United Kingdom", "Greece", "Australia"], correctAnswer: 1, difficulty: "hard" },
    { question: "What is the length of a cricket pitch?", options: ["18 yards", "20 yards", "22 yards", "24 yards"], correctAnswer: 2, difficulty: "hard" }
  ],

  movies: [
    // Easy (20 questions)
    { question: "Which actor played Iron Man in the Marvel movies?", options: ["Chris Evans", "Robert Downey Jr.", "Chris Hemsworth", "Mark Ruffalo"], correctAnswer: 1, difficulty: "easy" },
    { question: "What is the highest-grossing film of all time?", options: ["Avatar", "Avengers: Endgame", "Titanic", "Star Wars: The Force Awakens"], correctAnswer: 0, difficulty: "easy" },
    { question: "Which movie features the quote 'I'll be back'?", options: ["Terminator", "Predator", "Commando", "Total Recall"], correctAnswer: 0, difficulty: "easy" },
    { question: "Who directed 'Pulp Fiction'?", options: ["Martin Scorsese", "Quentin Tarantino", "Steven Spielberg", "Christopher Nolan"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which movie won the first Academy Award for Best Picture?", options: ["Wings", "Sunrise", "The Broadway Melody", "All Quiet on the Western Front"], correctAnswer: 0, difficulty: "easy" },
    { question: "What is the name of the hobbit played by Elijah Wood?", options: ["Bilbo", "Frodo", "Samwise", "Merry"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which Disney movie features the song 'Let It Go'?", options: ["Tangled", "Frozen", "Moana", "The Princess and the Frog"], correctAnswer: 1, difficulty: "easy" },
    { question: "Who played Jack in 'Titanic'?", options: ["Brad Pitt", "Tom Cruise", "Leonardo DiCaprio", "Johnny Depp"], correctAnswer: 2, difficulty: "easy" },
    { question: "Which movie features the Joker as the main villain?", options: ["Superman", "Batman", "Spider-Man", "X-Men"], correctAnswer: 1, difficulty: "easy" },
    { question: "What is the name of the wizard in The Lord of the Rings?", options: ["Dumbledore", "Gandalf", "Merlin", "Saruman"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which movie features a yellow minion named Kevin?", options: ["Shrek", "Despicable Me", "Toy Story", "Finding Nemo"], correctAnswer: 1, difficulty: "easy" },
    { question: "Who directed the 'Star Wars' original trilogy?", options: ["Steven Spielberg", "George Lucas", "James Cameron", "J.J. Abrams"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which actor played Neo in 'The Matrix'?", options: ["Keanu Reeves", "Brad Pitt", "Tom Cruise", "Will Smith"], correctAnswer: 0, difficulty: "easy" },
    { question: "What is the name of the dinosaur park in 'Jurassic Park'?", options: ["Dino World", "Isla Nublar", "Prehistoric Park", "Cretaceous Kingdom"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which movie features the quote 'You can't handle the truth!'?", options: ["A Few Good Men", "The Departed", "Goodfellas", "The Godfather"], correctAnswer: 0, difficulty: "easy" },
    { question: "Who played the Joker in 'The Dark Knight'?", options: ["Jack Nicholson", "Heath Ledger", "Jared Leto", "Joaquin Phoenix"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which movie won Best Picture at the 2023 Oscars?", options: ["Everything Everywhere All at Once", "The Fabelmans", "All Quiet on the Western Front", "Top Gun: Maverick"], correctAnswer: 0, difficulty: "easy" },
    { question: "What is the name of the superhero team in 'The Avengers'?", options: ["Justice League", "X-Men", "Fantastic Four", "The Avengers"], correctAnswer: 3, difficulty: "easy" },
    { question: "Which movie features a talking raccoon?", options: ["Guardians of the Galaxy", "Zootopia", "Ice Age", "Madagascar"], correctAnswer: 0, difficulty: "easy" },
    { question: "Who played Wolverine in the X-Men movies?", options: ["Hugh Jackman", "Ryan Reynolds", "Patrick Stewart", "Ian McKellen"], correctAnswer: 0, difficulty: "easy" },

    // Medium (20 questions)
    { question: "Which movie features the quote 'Here's looking at you, kid'?", options: ["Casablanca", "Gone with the Wind", "Citizen Kane", "The Maltese Falcon"], correctAnswer: 0, difficulty: "medium" },
    { question: "Who directed 'The Shining'?", options: ["Alfred Hitchcock", "Stanley Kubrick", "Steven Spielberg", "Martin Scorsese"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which actor has won the most Academy Awards for Best Actor?", options: ["Jack Nicholson", "Daniel Day-Lewis", "Tom Hanks", "Marlon Brando"], correctAnswer: 1, difficulty: "medium" },
    { question: "What was the first full-length CGI animated film?", options: ["Toy Story", "Shrek", "Finding Nemo", "The Lion King"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which movie features the character Hannibal Lecter?", options: ["Psycho", "The Silence of the Lambs", "Se7en", "American Psycho"], correctAnswer: 1, difficulty: "medium" },
    { question: "Who composed the music for 'Star Wars'?", options: ["Hans Zimmer", "John Williams", "Ennio Morricone", "James Horner"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which movie won the Palme d'Or at Cannes in 2019?", options: ["Parasite", "The Square", "Shoplifters", "Titane"], correctAnswer: 0, difficulty: "medium" },
    { question: "What is the name of the fictional country in 'Black Panther'?", options: ["Zamunda", "Wakanda", "Genovia", "Latveria"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which director has the most Oscar nominations?", options: ["Steven Spielberg", "Martin Scorsese", "William Wyler", "John Ford"], correctAnswer: 2, difficulty: "medium" },
    { question: "What year was 'The Godfather' released?", options: ["1970", "1972", "1974", "1976"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which actress has won the most Academy Awards?", options: ["Meryl Streep", "Katharine Hepburn", "Ingrid Bergman", "Bette Davis"], correctAnswer: 1, difficulty: "medium" },
    { question: "What is the highest-grossing R-rated movie of all time?", options: ["Deadpool", "Joker", "The Matrix", "American Sniper"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which movie features the quote 'I'm king of the world!'?", options: ["Titanic", "The Wolf of Wall Street", "Scarface", "Citizen Kane"], correctAnswer: 0, difficulty: "medium" },
    { question: "Who played the lead role in 'La La Land'?", options: ["Emma Stone and Ryan Gosling", "Jennifer Lawrence and Bradley Cooper", "Natalie Portman and Chris Hemsworth", "Anne Hathaway and Hugh Jackman"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which movie was the first to win 11 Academy Awards?", options: ["Titanic", "Ben-Hur", "The Lord of the Rings: The Return of the King", "West Side Story"], correctAnswer: 1, difficulty: "medium" },
    { question: "What is the name of the AI in '2001: A Space Odyssey'?", options: ["HAL 9000", "SKYNET", "JARVIS", "WOPR"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which movie features the quote 'You talking to me?'?", options: ["Taxi Driver", "Raging Bull", "Goodfellas", "The Godfather"], correctAnswer: 0, difficulty: "medium" },
    { question: "Who directed 'Parasite'?", options: ["Park Chan-wook", "Bong Joon-ho", "Lee Chang-dong", "Kim Jee-woon"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which movie features the character John McClane?", options: ["Lethal Weapon", "Die Hard", "Speed", "The Rock"], correctAnswer: 1, difficulty: "medium" },
    { question: "What was the first movie to feature synchronized sound?", options: ["The Jazz Singer", "Steamboat Willie", "Don Juan", "Lights of New York"], correctAnswer: 0, difficulty: "medium" },

    // Hard (10 questions)
    { question: "Which movie was the first to win the 'Big Five' Academy Awards?", options: ["It Happened One Night", "One Flew Over the Cuckoo's Nest", "The Silence of the Lambs", "Gone with the Wind"], correctAnswer: 0, difficulty: "hard" },
    { question: "Who was the first actress to win an Oscar?", options: ["Mary Pickford", "Janet Gaynor", "Katharine Hepburn", "Bette Davis"], correctAnswer: 1, difficulty: "hard" },
    { question: "Which movie features the longest continuous shot in cinema history?", options: ["Russian Ark", "Birdman", "1917", "Gravity"], correctAnswer: 0, difficulty: "hard" },
    { question: "What was the first animated film to be nominated for Best Picture?", options: ["Beauty and the Beast", "Toy Story 3", "Up", "Spirited Away"], correctAnswer: 0, difficulty: "hard" },
    { question: "Which director has the most films in the Sight & Sound critics' poll?", options: ["Alfred Hitchcock", "Stanley Kubrick", "Orson Welles", "Jean-Luc Godard"], correctAnswer: 0, difficulty: "hard" },
    { question: "What was the first movie to use CGI?", options: ["Tron", "Westworld", "Star Wars", "The Last Starfighter"], correctAnswer: 1, difficulty: "hard" },
    { question: "Which movie won the first Academy Award for Best Animated Feature?", options: ["Shrek", "Spirited Away", "Finding Nemo", "Toy Story"], correctAnswer: 0, difficulty: "hard" },
    { question: "What is the highest-grossing film adjusted for inflation?", options: ["Gone with the Wind", "Avatar", "Titanic", "Star Wars"], correctAnswer: 0, difficulty: "hard" },
    { question: "Which actor has appeared in the most Best Picture winners?", options: ["Jack Nicholson", "Meryl Streep", "Daniel Day-Lewis", "Katharine Hepburn"], correctAnswer: 0, difficulty: "hard" },
    { question: "What was the first movie to be rated PG-13?", options: ["Red Dawn", "Gremlins", "Indiana Jones and the Temple of Doom", "The Dark Crystal"], correctAnswer: 0, difficulty: "hard" }
  ],

  history: [
    // Easy (20 questions)
    { question: "Who was the first President of the United States?", options: ["Thomas Jefferson", "George Washington", "Abraham Lincoln", "John Adams"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which empire was ruled by Julius Caesar?", options: ["Greek", "Roman", "Egyptian", "Persian"], correctAnswer: 1, difficulty: "easy" },
    { question: "What year did World War II end?", options: ["1943", "1944", "1945", "1946"], correctAnswer: 2, difficulty: "easy" },
    { question: "Who discovered America in 1492?", options: ["Christopher Columbus", "Vasco da Gama", "Ferdinand Magellan", "Marco Polo"], correctAnswer: 0, difficulty: "easy" },
    { question: "Which ancient civilization built the pyramids?", options: ["Greeks", "Romans", "Egyptians", "Mayans"], correctAnswer: 2, difficulty: "easy" },
    { question: "What was the name of the ship that brought the Pilgrims to America?", options: ["Santa Maria", "Mayflower", "Nina", "Pinta"], correctAnswer: 1, difficulty: "easy" },
    { question: "Who was the British Prime Minister during World War II?", options: ["Neville Chamberlain", "Winston Churchill", "Clement Attlee", "David Lloyd George"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which country was ruled by Napoleon Bonaparte?", options: ["Spain", "France", "Italy", "Germany"], correctAnswer: 1, difficulty: "easy" },
    { question: "What year did the American Civil War begin?", options: ["1860", "1861", "1862", "1863"], correctAnswer: 1, difficulty: "easy" },
    { question: "Who wrote the Declaration of Independence?", options: ["George Washington", "Thomas Jefferson", "Benjamin Franklin", "John Adams"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which ancient wonder was located in Babylon?", options: ["Great Pyramid", "Hanging Gardens", "Colossus of Rhodes", "Lighthouse of Alexandria"], correctAnswer: 1, difficulty: "easy" },
    { question: "What was the name of the last Tsar of Russia?", options: ["Peter the Great", "Nicholas II", "Alexander II", "Ivan the Terrible"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which country was the first to give women the right to vote?", options: ["United States", "United Kingdom", "New Zealand", "Canada"], correctAnswer: 2, difficulty: "easy" },
    { question: "Who was the first woman to win a Nobel Prize?", options: ["Marie Curie", "Rosalind Franklin", "Dorothy Hodgkin", "Barbara McClintock"], correctAnswer: 0, difficulty: "easy" },
    { question: "What year did the Berlin Wall fall?", options: ["1987", "1988", "1989", "1990"], correctAnswer: 2, difficulty: "easy" },
    { question: "Which civilization invented paper?", options: ["Egyptian", "Chinese", "Greek", "Roman"], correctAnswer: 1, difficulty: "easy" },
    { question: "Who was the first person to walk on the moon?", options: ["Buzz Aldrin", "Neil Armstrong", "John Glenn", "Alan Shepard"], correctAnswer: 1, difficulty: "easy" },
    { question: "What year did the Titanic sink?", options: ["1908", "1912", "1915", "1920"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which empire was ruled by Genghis Khan?", options: ["Ottoman", "Mongol", "Persian", "Byzantine"], correctAnswer: 1, difficulty: "easy" },
    { question: "What was the name of the first successful English colony in America?", options: ["Plymouth", "Jamestown", "Roanoke", "Massachusetts Bay"], correctAnswer: 1, difficulty: "easy" },

    // Medium (20 questions)
    { question: "What year did the French Revolution begin?", options: ["1776", "1789", "1799", "1812"], correctAnswer: 1, difficulty: "medium" },
    { question: "Who was the first Roman Emperor?", options: ["Julius Caesar", "Augustus", "Nero", "Caligula"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which civilization built Machu Picchu?", options: ["Aztec", "Maya", "Inca", "Olmec"], correctAnswer: 2, difficulty: "medium" },
    { question: "What was the name of the first atomic bomb dropped on Japan?", options: ["Fat Man", "Little Boy", "Thin Man", "Big Boy"], correctAnswer: 1, difficulty: "medium" },
    { question: "Who was the first female Prime Minister of the United Kingdom?", options: ["Queen Elizabeth II", "Margaret Thatcher", "Theresa May", "Indira Gandhi"], correctAnswer: 1, difficulty: "medium" },
    { question: "What year did the Russian Revolution begin?", options: ["1905", "1917", "1922", "1939"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which ancient Greek philosopher was sentenced to death by drinking hemlock?", options: ["Aristotle", "Plato", "Socrates", "Pythagoras"], correctAnswer: 2, difficulty: "medium" },
    { question: "What was the name of the ship Charles Darwin sailed on?", options: ["Beagle", "Endeavour", "Discovery", "Challenger"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which empire was known for building the Taj Mahal?", options: ["Ottoman", "Mughal", "Persian", "British"], correctAnswer: 1, difficulty: "medium" },
    { question: "Who was the first African American Supreme Court Justice?", options: ["Thurgood Marshall", "Clarence Thomas", "Booker T. Washington", "Martin Luther King Jr."], correctAnswer: 0, difficulty: "medium" },
    { question: "What year did the Cold War officially end?", options: ["1985", "1989", "1991", "1993"], correctAnswer: 2, difficulty: "medium" },
    { question: "Which civilization invented the compass?", options: ["Greek", "Chinese", "Arab", "Indian"], correctAnswer: 1, difficulty: "medium" },
    { question: "Who was the last Emperor of China?", options: ["Qianlong Emperor", "Kangxi Emperor", "Puyi", "Guangxu Emperor"], correctAnswer: 2, difficulty: "medium" },
    { question: "What was the name of the first permanent English settlement in America?", options: ["Plymouth", "Jamestown", "Roanoke", "Massachusetts Bay"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which country was the first to abolish slavery?", options: ["United States", "United Kingdom", "France", "Haiti"], correctAnswer: 3, difficulty: "medium" },
    { question: "Who was the first European to reach India by sea?", options: ["Christopher Columbus", "Vasco da Gama", "Ferdinand Magellan", "Marco Polo"], correctAnswer: 1, difficulty: "medium" },
    { question: "What year did the Vietnam War end?", options: ["1973", "1975", "1977", "1979"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which ancient wonder was destroyed by fire in 356 BC?", options: ["Temple of Artemis", "Colossus of Rhodes", "Mausoleum at Halicarnassus", "Lighthouse of Alexandria"], correctAnswer: 0, difficulty: "medium" },
    { question: "Who was the first female pharaoh of Egypt?", options: ["Cleopatra", "Nefertiti", "Hatshepsut", "Nefertari"], correctAnswer: 2, difficulty: "medium" },
    { question: "What was the name of the first satellite launched into space?", options: ["Explorer 1", "Sputnik 1", "Vanguard 1", "Telstar 1"], correctAnswer: 1, difficulty: "medium" },

    // Hard (10 questions)
    { question: "Which year did the Black Death peak in Europe?", options: ["1347", "1351", "1360", "1374"], correctAnswer: 1, difficulty: "hard" },
    { question: "Who was the first Holy Roman Emperor?", options: ["Charlemagne", "Otto I", "Frederick I", "Henry IV"], correctAnswer: 0, difficulty: "hard" },
    { question: "What was the name of the first written constitution?", options: ["Magna Carta", "Code of Hammurabi", "United States Constitution", "Twelve Tables"], correctAnswer: 1, difficulty: "hard" },
    { question: "Which civilization invented the concept of zero?", options: ["Greek", "Chinese", "Indian", "Arab"], correctAnswer: 2, difficulty: "hard" },
    { question: "Who was the last Byzantine Emperor?", options: ["Justinian I", "Constantine XI", "Heraclius", "Basil II"], correctAnswer: 1, difficulty: "hard" },
    { question: "What year did the Spanish Armada set sail?", options: ["1585", "1588", "1591", "1595"], correctAnswer: 1, difficulty: "hard" },
    { question: "Which ancient city was destroyed by a volcanic eruption in 79 AD?", options: ["Athens", "Pompeii", "Carthage", "Troy"], correctAnswer: 1, difficulty: "hard" },
    { question: "Who was the first female ruler of the Habsburg Empire?", options: ["Maria Theresa", "Catherine the Great", "Elizabeth I", "Isabella I"], correctAnswer: 0, difficulty: "hard" },
    { question: "What was the name of the first successful English colony in America?", options: ["Plymouth", "Jamestown", "Roanoke", "Massachusetts Bay"], correctAnswer: 1, difficulty: "hard" },
    { question: "Which year did the Protestant Reformation begin?", options: ["1492", "1517", "1534", "1555"], correctAnswer: 1, difficulty: "hard" }
  ],

  fashion: [
    // Easy (20 questions)
    { question: "Which fashion designer created the 'Little Black Dress'?", options: ["Coco Chanel", "Christian Dior", "Yves Saint Laurent", "Giorgio Armani"], correctAnswer: 0, difficulty: "easy" },
    { question: "What is the most expensive fabric in the world?", options: ["Silk", "Cashmere", "Vicuña", "Linen"], correctAnswer: 2, difficulty: "easy" },
    { question: "Which brand is known for its red-soled shoes?", options: ["Manolo Blahnik", "Christian Louboutin", "Jimmy Choo", "Salvatore Ferragamo"], correctAnswer: 1, difficulty: "easy" },
    { question: "What year was the bikini invented?", options: ["1936", "1946", "1956", "1966"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which fashion capital is known for haute couture?", options: ["Paris", "Milan", "New York", "London"], correctAnswer: 0, difficulty: "easy" },
    { question: "What is the name of the famous fashion magazine founded in 1892?", options: ["Elle", "Vogue", "Harper's Bazaar", "Cosmopolitan"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which designer created the 'New Look' in 1947?", options: ["Coco Chanel", "Christian Dior", "Cristóbal Balenciaga", "Hubert de Givenchy"], correctAnswer: 1, difficulty: "easy" },
    { question: "What type of clothing item are Levi's famous for?", options: ["T-shirts", "Jeans", "Suits", "Dresses"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which accessory did Audrey Hepburn make famous in 'Breakfast at Tiffany's'?", options: ["Pearl necklace", "Black gloves", "Turban", "Little black dress"], correctAnswer: 0, difficulty: "easy" },
    { question: "What is the most common material for making t-shirts?", options: ["Silk", "Cotton", "Polyester", "Linen"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which fashion house has a double-C logo?", options: ["Chanel", "Gucci", "Louis Vuitton", "Prada"], correctAnswer: 0, difficulty: "easy" },
    { question: "What type of shoes have no heels?", options: ["Flats", "Wedges", "Platforms", "Stilettos"], correctAnswer: 0, difficulty: "easy" },
    { question: "Which color is traditionally associated with weddings in Western culture?", options: ["White", "Red", "Blue", "Green"], correctAnswer: 0, difficulty: "easy" },
    { question: "What is the name for a person who models clothes?", options: ["Designer", "Model", "Stylist", "Editor"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which accessory is worn around the neck?", options: ["Bracelet", "Necklace", "Ring", "Earrings"], correctAnswer: 1, difficulty: "easy" },
    { question: "What type of clothing is a 'blazer'?", options: ["Jacket", "Pants", "Shirt", "Shoes"], correctAnswer: 0, difficulty: "easy" },
    { question: "Which brand is known for its check pattern?", options: ["Burberry", "Gucci", "Prada", "Versace"], correctAnswer: 0, difficulty: "easy" },
    { question: "What is the most common fastening for jeans?", options: ["Buttons", "Zipper", "Velcro", "Snaps"], correctAnswer: 1, difficulty: "easy" },
    { question: "Which fashion week is the oldest?", options: ["New York", "London", "Milan", "Paris"], correctAnswer: 0, difficulty: "easy" },
    { question: "What type of fabric is denim?", options: ["Cotton", "Silk", "Wool", "Linen"], correctAnswer: 0, difficulty: "easy" },

    // Medium (20 questions)
    { question: "Who designed the wedding dress for Princess Diana?", options: ["Alexander McQueen", "David and Elizabeth Emanuel", "Bruce Oldfield", "Catherine Walker"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which fashion designer founded the brand Versace?", options: ["Gianni Versace", "Donatella Versace", "Santo Versace", "Allegra Versace"], correctAnswer: 0, difficulty: "medium" },
    { question: "What year was the first fashion week held in New York?", options: ["1943", "1953", "1963", "1973"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which designer created the 'wrap dress'?", options: ["Diane von Fürstenberg", "Donna Karan", "Calvin Klein", "Ralph Lauren"], correctAnswer: 0, difficulty: "medium" },
    { question: "What is the name of the famous fashion district in Milan?", options: ["Via Montenapoleone", "Rodeo Drive", "Oxford Street", "Champs-Élysées"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which fashion icon was known for her 'little boy' haircut?", options: ["Coco Chanel", "Twiggy", "Edie Sedgwick", "Audrey Hepburn"], correctAnswer: 1, difficulty: "medium" },
    { question: "What type of clothing is a 'kaftan'?", options: ["Dress", "Coat", "Pants", "Shirt"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which designer created the 'trapeze dress'?", options: ["Yves Saint Laurent", "Coco Chanel", "Christian Dior", "Cristóbal Balenciaga"], correctAnswer: 0, difficulty: "medium" },
    { question: "What is the most expensive handbag ever sold at auction?", options: ["Hermès Birkin", "Chanel 2.55", "Louis Vuitton Speedy", "Prada Galleria"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which fashion trend was popularized by Mary Quant in the 1960s?", options: ["Miniskirt", "Bell-bottoms", "Power suit", "Hippie dress"], correctAnswer: 0, difficulty: "medium" },
    { question: "What is the name of the famous fashion museum in Paris?", options: ["Palais Galliera", "Louvre", "Musée d'Orsay", "Centre Pompidou"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which designer created the 'power suit' for women?", options: ["Giorgio Armani", "Gianni Versace", "Gianfranco Ferré", "Thierry Mugler"], correctAnswer: 0, difficulty: "medium" },
    { question: "What type of fabric is 'tweed'?", options: ["Wool", "Cotton", "Silk", "Linen"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which fashion house was founded by Miuccia Prada?", options: ["Prada", "Miu Miu", "Both A and B", "Neither"], correctAnswer: 2, difficulty: "medium" },
    { question: "What is the name of the famous fashion street in London?", options: ["Savile Row", "Oxford Street", "Bond Street", "Carnaby Street"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which accessory did Jacqueline Kennedy Onassis make famous?", options: ["Pearl necklace", "Oversized sunglasses", "Headscarf", "All of the above"], correctAnswer: 3, difficulty: "medium" },
    { question: "What year was the first issue of Vogue published?", options: ["1892", "1902", "1912", "1922"], correctAnswer: 0, difficulty: "medium" },
    { question: "Which designer created the 'bubble dress'?", options: ["Pierre Cardin", "Yves Saint Laurent", "Christian Dior", "Hubert de Givenchy"], correctAnswer: 0, difficulty: "medium" },
    { question: "What is the most common material for making suits?", options: ["Cotton", "Wool", "Polyester", "Linen"], correctAnswer: 1, difficulty: "medium" },
    { question: "Which fashion trend was popularized by hip-hop culture in the 1980s?", options: ["Baggy jeans", "Skinny jeans", "Cargo pants", "Bell-bottoms"], correctAnswer: 0, difficulty: "medium" },

    // Hard (10 questions)
    { question: "Who was the first American fashion designer?", options: ["Charles Frederick Worth", "Mainbocher", "Claire McCardell", "Norman Norell"], correctAnswer: 1, difficulty: "hard" },
    { question: "What year was the first ready-to-wear collection shown?", options: ["1910", "1920", "1930", "1940"], correctAnswer: 2, difficulty: "hard" },
    { question: "Which designer created the 'sack dress'?", options: ["Cristóbal Balenciaga", "Christian Dior", "Coco Chanel", "Hubert de Givenchy"], correctAnswer: 0, difficulty: "hard" },
    { question: "What is the name of the famous fashion school in Paris?", options: ["École de la Chambre Syndicale de la Couture Parisienne", "Central Saint Martins", "Fashion Institute of Technology", "Royal Academy of Fine Arts"], correctAnswer: 0, difficulty: "hard" },
    { question: "Which fashion house was the first to show a collection online?", options: ["Burberry", "Gucci", "Prada", "Louis Vuitton"], correctAnswer: 2, difficulty: "hard" },
    { question: "What year was the first fashion blog created?", options: ["1995", "2000", "2005", "2010"], correctAnswer: 1, difficulty: "hard" },
    { question: "Which designer created the 'le smoking' tuxedo for women?", options: ["Yves Saint Laurent", "Coco Chanel", "Christian Dior", "Cristóbal Balenciaga"], correctAnswer: 0, difficulty: "hard" },
    { question: "What is the most expensive piece of jewelry ever sold at auction?", options: ["The Pink Star diamond", "The Hope Diamond", "The Cullinan Diamond", "The Koh-i-Noor"], correctAnswer: 0, difficulty: "hard" },
    { question: "Which fashion trend was popularized by the film 'Saturday Night Fever'?", options: ["Disco suits", "Hippie dresses", "Punk clothing", "Grunge fashion"], correctAnswer: 0, difficulty: "hard" },
    { question: "What year was the first sustainable fashion week held?", options: ["2010", "2015", "2020", "2022"], correctAnswer: 1, difficulty: "hard" }
  ]
};



