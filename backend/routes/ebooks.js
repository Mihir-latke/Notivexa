const r = require('express').Router();
const { authenticate } = require('../middleware/auth');
const BOOKS = [
  {id:1,title:'NCERT Chemistry Class 12 Part 1',author:'NCERT',subject:'Chemistry',emoji:'⚗️',color:'#DBEAFE',tags:['Free','Class 12','PDF'],url:'https://ncert.nic.in'},
  {id:2,title:'NCERT Chemistry Class 12 Part 2',author:'NCERT',subject:'Chemistry',emoji:'🧪',color:'#DCFCE7',tags:['Free','Class 12'],url:'https://ncert.nic.in'},
  {id:3,title:'Concepts of Physics Vol 1',author:'H.C. Verma',subject:'Physics',emoji:'⚛️',color:'#FEF9C3',tags:['JEE','Popular'],url:'https://archive.org'},
  {id:4,title:'Concepts of Physics Vol 2',author:'H.C. Verma',subject:'Physics',emoji:'🔭',color:'#EDE9FE',tags:['JEE'],url:'https://archive.org'},
  {id:5,title:'NCERT Mathematics Class 12',author:'NCERT',subject:'Maths',emoji:'📐',color:'#FFF7ED',tags:['Free','Class 12'],url:'https://ncert.nic.in'},
  {id:6,title:'RD Sharma Mathematics',author:'R.D. Sharma',subject:'Maths',emoji:'📊',color:'#FDF4FF',tags:['Class 12'],url:'https://archive.org'},
  {id:7,title:'Organic Chemistry',author:'Morrison & Boyd',subject:'Chemistry',emoji:'🧬',color:'#ECFDF5',tags:['Advanced'],url:'https://archive.org'},
  {id:8,title:'Problems in General Physics',author:'I.E. Irodov',subject:'Physics',emoji:'⚡',color:'#FFF1F2',tags:['JEE'],url:'https://archive.org'},
  {id:9,title:'NCERT Biology Class 12',author:'NCERT',subject:'Biology',emoji:'🦋',color:'#F0FDF4',tags:['Free','NEET'],url:'https://ncert.nic.in'},
  {id:10,title:'NCERT Physics Class 12',author:'NCERT',subject:'Physics',emoji:'🌊',color:'#F5F3FF',tags:['Free','Class 12'],url:'https://ncert.nic.in'},
  {id:11,title:'NCERT History Class 12',author:'NCERT',subject:'History',emoji:'🏛️',color:'#FFFBEB',tags:['Free','UPSC'],url:'https://ncert.nic.in'},
  {id:12,title:'Arihant Physics for JEE',author:'Arihant',subject:'Physics',emoji:'🌟',color:'#EDE9FE',tags:['JEE','2024'],url:'https://archive.org'},
];
r.use(authenticate);
r.get('/', (req, res) => {
  const { q, subject } = req.query;
  let books = [...BOOKS];
  if (q) { const ql=q.toLowerCase(); books=books.filter(b=>b.title.toLowerCase().includes(ql)||b.author.toLowerCase().includes(ql)); }
  if (subject && subject!=='All') books=books.filter(b=>b.subject===subject);
  res.json({ success:true, books, total:books.length });
});
module.exports = r;