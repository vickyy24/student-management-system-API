const express = require("express");
const mailer = require("nodemailer");
const multer = require("multer");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const PORT = 9000;
const app = express();

app.use(express.json());
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(cookieParser());

const connection = mysql.createConnection({
    host:"localhost",
    user:"root",
    password:"tiger",
    database:"studentdb"
})

connection.connect(function(err){
    if(err){
        console.log("DB connection error", err);
    }
    else{
        console.log("DB connected");
    }
})
const con = connection.promise();
const transporter = mailer.createTransport({
    service: "gmail",
    auth: {
        user: "vikassontakke2002@gmail.com",      
        pass: "tius gmss nlfn ferd"          
    }
});

//multer
const storage = multer.diskStorage({
    destination: "Studentdata/",
    filename: (req, file, cb) => {
        cb(null, path.parse(file.originalname).name + '_' +Date.now()+path.extname(file.originalname));
    }
});

const upload = multer({ storage });

//CourseDropdown Api
app.get("/coursesdd", async function (req, res) {
    try {
        const [result] = await con.query("SELECT * FROM courses");
        res.send(result);
    } catch (err) {
        console.log("Error fetching courses", err);
        res.status(500).send({ message: "DB Error" });
    }
    // await con.query("SELECT * FROM courses", function (err, result) {
    //     if (err) {
    //         console.log("Error fetching courses", err);
    //         res.status(500).send({ message: "DB Error" });
    //     } 
    //     else {
    //         res.send(result);
    //     }
    // });
});

// Registration Api
app.post("/register", upload.single("aadharimage"), async (req, res) => {

    try {
        const d = req.body;
        const aadharfilename = req.file.filename;

        const password = Math.floor(100000 + Math.random() * 900000);

        const qualificationList = JSON.parse(d.qualificationList);

        //Profile
        const [profileResult] = await con.query(`INSERT INTO student_profile(Branch, RegistrationDate, FirstName, LastName, Gender, BirthDate,EmailAddress, MobileNumber, WhatsappNumber, ParentName, ParentNumber,AadharNumber, AadharImage, LocalAddress, PermanentAddress, Password)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [d.branch,d.registrationdate,d.firstname,d.lastname,d.gender,d.birthdate,d.emailaddress,d.mobilenumber,d.whatsappnumber,d.parentname,d.parentnumber,d.aadharnumber,
            aadharfilename,d.localaddress,d.permanentaddress,password] 
        );
        // function(err, result){
        // if(err) throw err;

        const studentId = profileResult.insertId;

        // Qualification
        for (let i = 0; i < qualificationList.length; i++) {
            const q = qualificationList[i];

            await con.query(
                "insert into student_qualification(StudentId,QualificationName,University,PassingYear,Medium,Percentage) values(?,?,?,?,?,?)",
                [studentId,q.qualification_name,q.university_name,q.passing_year,q.medium,q.percentage]
            );
        }

        // Registration
        await con.query("insert into registration_details(StudentId,CourseName,FeeAmount,Gst,TotalFee,Discount,FinalFee) values(?,?,?,?,?,?,?)",
            [studentId,d.coursename,d.feeamount,d.gst,d.totalfee,d.discount,d.finalfee]
            // function(err){
            //     if(err) throw err;
            // }
        );

        // Payment
        await con.query("insert into payment_details(StudentId,PaymentDate,PaymentAmount,PaymentMode,PaymentDescription) values(?,?,?,?,?)",
            [studentId,d.paymentdate,d.paymentamount,d.paymentmode,d.paymentdescription]
            // function(err){
            //     if(err) throw err;
            // }
        );

        // email sent
        await transporter.sendMail({
            from: "vikassontakke2002@gmail.com",
            to: d.emailaddress,
            subject: "Account Created Successfully",
            text: `Dear ${d.firstname},
            Your Account has been Created successfully.You can login using:Email: ${d.emailaddress} and Password: ${password}`
        });
        res.status(200).send({ message: "Student Registered Successfully" });
        // }
       
    }catch(err){
        console.log(err); 
        res.status(500).send({ message: "Error while registering student" });
    }
    
});
app.post("/login", async (req, res) => {
    try {
        const d = req.body;

        const [result] = await con.query("SELECT * FROM student_profile WHERE EmailAddress=? AND Password=?",[d.emailaddress, d.password]);

        if (result.length === 0) {
            return res.status(401).send({ message: "Invalid credentials" });
        }

        const user = result[0];

        const token = jwt.sign(
            { id: user.StudentId, email: user.EmailAddress },
            "vikas123",
            { expiresIn: "30d" }
        );
        res.cookie("tokenn", token, {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: 30 * 24 * 60 * 60 * 1000
        });

        res.status(200).send({ message: "Login successful" });

    } catch (err) {
        console.log(err);
        res.status(500).send({ message: "Login error" });
    }
});
app.get("/verify", (req, res) => {
    const token = req.cookies.tokenn;

    if (!token) {
        return res.status(401).send("No token");
    }

    try {
        jwt.verify(token, "vikas123");
        res.status(200).send("Valid user");
    } catch (err) {
        res.status(401).send("Invalid token");
    }
});
app.listen(PORT,function(){
    console.log(`Server started on ${PORT}`)
})