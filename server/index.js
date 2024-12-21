const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
require('dotenv').config()

const port = process.env.PORT || 9000
const app = express()

app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

// verifyToken
const verufyToken = (req,res,next) => {
  const token = req.cookies?.token
  if(!token){
    return res.status(401).send({message: 'unAthorize access'})
  }

  jwt.verify(token,process.env.SECRET_KEY,(err,decoded) => {
    if(err){
      return res.status(401).send({message: 'unAthorize access'})
    }
    req.user = decoded
  })
  next()
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.h3mej.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {
    const db = client.db('solo-db')
    const jobsCollection = db.collection('jobs')
    const bidsCollection = db.collection('bids')

    // generate jwt
    app.post('/jwt',async(req,res) => {
      const email = req.body
      const token = jwt.sign(email,process.env.SECRET_KEY,{expiresIn: '365d'})
      res.cookie('token',token,{
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      })

      .send({success: true})
    })

    // clear cookie logout
    app.get('/logout',async(req,res) => {
      res.clearCookie('token',{
        maxAge: 0,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      }).send({success: true})
    })

    // save a jobData in db
    app.post('/add-job',async(req,res) => {
      const jobData = req.body;
      const result = await jobsCollection.insertOne(jobData)
      res.send(result)
    })

    // get a single job update
    app.get('/job/:id',async(req,res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await jobsCollection.findOne(query)
      res.send(result)
    })

    // get add job single user
    app.get('/jobs/:email',async(req,res) => {
      const email = req.params.email;
      const query = {'buyer.email': email }
      const result = await jobsCollection.find(query).toArray()
      res.send(result)
    })

    // delete a job from db
    app.delete('/job/:id',async(req,res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await jobsCollection.deleteOne(query)
      res.send(result)
    })

    // update job
    app.put('/update-job/:id',async(req,res) => {
      const id = req.params.id;
      const jobData = req.body;
      const query = {_id: new ObjectId(id)}
      const updated = {
        $set: jobData,
      }
      const option = {upsert: true}
      const result = await jobsCollection.updateOne(query,updated,option)
      res.send(result)
    })

    // get all jobs data
    app.get('/jobs',async(req,res) => {
      const cursor = jobsCollection.find();
      const result = await cursor.toArray();
      res.send(result)
    })

    // save bid-Data in db
    app.post('/add-bid',async(req,res) => {
      const bidData = req.body;
      // if a user placed a bid alrady in this job
      const query = {email: bidData.email , jobId: bidData.jobId}
      const alradyExist = await bidsCollection.findOne(query)
      if(alradyExist) return res.status(400).send('you have alrady placed a bid this job')
        // console.log('alrady exist -->',alradyExist)
      // save data in bid collection
      const result = await bidsCollection.insertOne(bidData)
      // increase bid collection
      const filter = {_id: new ObjectId(bidData.jobId)}
      const update = {
        $inc: {bid_count: 1},
      }
      const updateBidCount = await jobsCollection.updateOne(filter,update)

      res.send(result)
    })

    // get all bids for a specfic user
    app.get('/bids/:email',verufyToken,async(req,res) => {
      const decodedEmail = req.user?.email
      const isBuyer = req.query.buyer
      const email = req.params.email
      if(decodedEmail !== email){
        return res.status(401).send({message: 'unAthorize access'})
      }

      let query = {}
      if(isBuyer){
        query.buyer = email
      }
      else{
        query.email = email
      }
      const result = await bidsCollection.find(query).toArray()
      res.send(result)
    })

    // update bid status
    app.patch('/bid-status-update/:id',async(req,res) => {
        const id = req.params.id
        const {status} = req.body
        const filter = {_id: new ObjectId(id)}
        const updated = {
            $set: {status},
        }
        const result = await bidsCollection.updateOne(filter,updated)
        res.send(result)
    })

    // get all jobs
    app.get('/all-jobs',async(req,res) => {
      const filter = req.query.filter
      const search = req.query.search
      const sort = req.query.sort
      let options = {}
      if(sort) options = {sort: {deadline: sort === 'asc' ? 1 : -1}}
      const query = {title: {
        $regex: search,
        $options: 'i',
      }}
      if(filter) query.category = filter
      const result = await jobsCollection.find(query,options).toArray()
      res.send(result)
    }) 

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)
app.get('/', (req, res) => {
  res.send('Hello from SoloSphere Server....')
})

app.listen(port, () => console.log(`Server running on port ${port}`))
