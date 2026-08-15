const r = require('express').Router();
const { authenticate } = require('../middleware/auth');

const BOOKS = [
  // Science
  {id:1,title:'NCERT Chemistry 12 Part 1',author:'NCERT',subject:'Chemistry',category:'Science',emoji:'⚗️',color:'#DBEAFE',tags:['Free','Class 12'],url:'https://ncert.nic.in/textbook.php?lech1=0-16'},
  {id:2,title:'Concepts of Physics Vol 1',author:'H.C. Verma',subject:'Physics',category:'Science',emoji:'⚛️',color:'#FEF9C3',tags:['JEE','Popular'],url:'https://archive.org/search?query=hc+verma+concepts+of+physics'},
  {id:3,title:'NCERT Mathematics 12',author:'NCERT',subject:'Maths',category:'Science',emoji:'📐',color:'#FFF7ED',tags:['Free','Class 12'],url:'https://ncert.nic.in/textbook.php?lemh1=0-14'},
  {id:4,title:'Organic Chemistry',author:'Morrison & Boyd',subject:'Chemistry',category:'Science',emoji:'🧬',color:'#ECFDF5',tags:['Advanced'],url:'https://archive.org/search?query=morrison+boyd+organic+chemistry'},
  {id:5,title:'Problems in General Physics',author:'I.E. Irodov',subject:'Physics',category:'Science',emoji:'⚡',color:'#FFF1F2',tags:['JEE'],url:'https://archive.org/search?query=irodov+problems+physics'},
  {id:6,title:'NCERT Biology 12',author:'NCERT',subject:'Biology',category:'Science',emoji:'🦋',color:'#F0FDF4',tags:['Free','NEET'],url:'https://ncert.nic.in/textbook.php?kebo1=0-16'},
  {id:7,title:'NCERT Physics 12 Part 1',author:'NCERT',subject:'Physics',category:'Science',emoji:'🌊',color:'#F5F3FF',tags:['Free'],url:'https://ncert.nic.in/textbook.php?leph1=0-15'},
  // MCA / Computer Science
  {id:10,title:'Data Structures & Algorithms',author:'Cormen et al (CLRS)',subject:'DSA',category:'MCA',emoji:'🌳',color:'#EDE9FE',tags:['MCA','Must Read'],url:'https://archive.org/search?query=introduction+algorithms+cormen'},
  {id:11,title:'Computer Networks',author:'Forouzan',subject:'Networks',category:'MCA',emoji:'🌐',color:'#DBEAFE',tags:['MCA','Semester'],url:'https://archive.org/search?query=forouzan+computer+networks'},
  {id:12,title:'Database Management Systems',author:'Ramakrishnan & Gehrke',subject:'DBMS',category:'MCA',emoji:'🗄️',color:'#F0FDF4',tags:['MCA','Semester'],url:'https://archive.org/search?query=database+management+systems+ramakrishnan'},
  {id:13,title:'Operating System Concepts',author:'Silberschatz',subject:'OS',category:'MCA',emoji:'💻',color:'#FFF7ED',tags:['MCA','Popular'],url:'https://archive.org/search?query=operating+system+concepts+silberschatz'},
  {id:14,title:'Software Engineering',author:'Ian Sommerville',subject:'SE',category:'MCA',emoji:'⚙️',color:'#FFF1F2',tags:['MCA','Semester'],url:'https://archive.org/search?query=software+engineering+sommerville'},
  {id:15,title:'Java: The Complete Reference',author:'Herbert Schildt',subject:'Java',category:'MCA',emoji:'☕',color:'#FFFBEB',tags:['MCA','Programming'],url:'https://archive.org/search?query=java+complete+reference+schildt'},
  {id:16,title:'Computer Organization',author:'Carl Hamacher',subject:'CO',category:'MCA',emoji:'🔧',color:'#F5F3FF',tags:['MCA','Semester'],url:'https://archive.org/search?query=computer+organization+hamacher'},
  {id:17,title:'Discrete Mathematics',author:'Kenneth Rosen',subject:'DM',category:'MCA',emoji:'∑',color:'#EDE9FE',tags:['MCA','Maths'],url:'https://archive.org/search?query=discrete+mathematics+rosen'},
  {id:18,title:'Artificial Intelligence',author:'Russell & Norvig',subject:'AI',category:'MCA',emoji:'🤖',color:'#DCFCE7',tags:['MCA','Advanced'],url:'https://archive.org/search?query=artificial+intelligence+modern+approach'},
  {id:19,title:'Web Technologies',author:'Uttam K. Roy',subject:'Web',category:'MCA',emoji:'🌍',color:'#DBEAFE',tags:['MCA','Programming'],url:'https://archive.org/search?query=web+technologies+html+css+javascript'},
  {id:20,title:'Python Programming',author:'Mark Lutz',subject:'Python',category:'MCA',emoji:'🐍',color:'#F0FDF4',tags:['MCA','Programming'],url:'https://archive.org/search?query=learning+python+mark+lutz'},
];

const YOUTUBE = [
  {id:1,title:'Data Structures — Full Course',channel:'Abdul Bari',subject:'DSA',category:'MCA',emoji:'🌳',color:'#EDE9FE',url:'https://youtube.com/watch?v=RBSGKlAvoiM',duration:'8 hours',views:'5.2M'},
  {id:2,title:'Database Management System',channel:'Gate Smashers',subject:'DBMS',category:'MCA',emoji:'🗄️',color:'#DBEAFE',url:'https://youtube.com/watch?v=kBdlM6hNDAE',duration:'12 hours',views:'3.1M'},
  {id:3,title:'Operating Systems',channel:'Neso Academy',subject:'OS',category:'MCA',emoji:'💻',color:'#F0FDF4',url:'https://youtube.com/watch?v=vBURTt97EkA',duration:'10 hours',views:'4.5M'},
  {id:4,title:'Computer Networks Full Course',channel:'Neso Academy',subject:'Networks',category:'MCA',emoji:'🌐',color:'#FFF7ED',url:'https://youtube.com/watch?v=IF0nI0-VHSQ',duration:'9 hours',views:'3.8M'},
  {id:5,title:'Java Complete Tutorial',channel:'Telusko',subject:'Java',category:'MCA',emoji:'☕',color:'#FFFBEB',url:'https://youtube.com/watch?v=8cm1x4bC610',duration:'11 hours',views:'6.2M'},
  {id:6,title:'Python Tutorial for Beginners',channel:'Programming with Mosh',subject:'Python',category:'MCA',emoji:'🐍',color:'#DCFCE7',url:'https://youtube.com/watch?v=_uQrJ0TkZlc',duration:'6 hours',views:'14M'},
  {id:7,title:'Web Development Full Course',channel:'freeCodeCamp',subject:'Web',category:'MCA',emoji:'🌍',color:'#FEE2E2',url:'https://youtube.com/watch?v=nu_pCVPKzTk',duration:'12 hours',views:'8.1M'},
  {id:8,title:'Machine Learning Course',channel:'Krish Naik',subject:'ML',category:'MCA',emoji:'🧠',color:'#F3E8FF',url:'https://youtube.com/watch?v=GwIo3gDZCVQ',duration:'15 hours',views:'2.9M'},
  {id:9,title:'Physics Wallah — JEE Physics',channel:'Physics Wallah',subject:'Physics',category:'Science',emoji:'⚡',color:'#FFF7ED',url:'https://youtube.com/@PhysicsWallah',duration:'Full Course',views:'10M+'},
  {id:10,title:'Chemistry by Pradeep Sharma',channel:'Khan Academy India',subject:'Chemistry',category:'Science',emoji:'⚗️',color:'#DBEAFE',url:'https://youtube.com/@khanacademyhindi',duration:'Full Course',views:'5M+'},
  {id:11,title:'Vedantu Master Teachers',channel:'Vedantu',subject:'Maths',category:'Science',emoji:'📐',color:'#FFF1F2',url:'https://youtube.com/@VedantuJEE',duration:'Full Course',views:'8M+'},
  {id:12,title:'MIT OpenCourseWare — Algorithms',channel:'MIT OCW',subject:'DSA',category:'MCA',emoji:'🎓',color:'#EDE9FE',url:'https://youtube.com/watch?v=ZA-tUyM_y7s',duration:'24 lectures',views:'1.2M'},
];

r.use(authenticate);
r.get('/', (req, res) => {
  const { q='', category='All', subject='All', type='books' } = req.query;
  const src = type === 'youtube' ? YOUTUBE : BOOKS;
  let items = [...src];
  if (q) { const ql=q.toLowerCase(); items=items.filter(b=>b.title.toLowerCase().includes(ql)||b.author?.toLowerCase().includes(ql)||b.channel?.toLowerCase().includes(ql)||b.subject.toLowerCase().includes(ql)); }
  if (category !== 'All') items = items.filter(b => b.category === category);
  if (subject !== 'All') items = items.filter(b => b.subject === subject);
  const cats = [...new Set([...BOOKS,...YOUTUBE].map(b=>b.category))];
  res.json({ success:true, items, total:items.length, categories:cats });
});

module.exports = r;
