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
    origin: "http://localhost:3000",
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
});

//user existance in DB check-up
app.post("/check-user", async (req, res) => {
    try {
        const d = req.body;

        const [result] = await con.query(
            "SELECT * FROM student_profile WHERE EmailAddress=? OR MobileNumber=? OR AadharNumber=?",
            [d.emailaddress, d.mobilenumber]
        );

        if (result.length > 0) {
            res.status(400).send({ message: "User already exists" });
        } else {
            res.status(200).send({ message: "User not exists" });
        }

    } catch (err) {
        console.log(err);
        res.status(500).send({ message: "Server error" });
    }
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
app.get("/dashboard-details", async(req, res) => {
    const toke = req.cookies.tokenn;

    if (!toke) {
        return res.status(401).send("Unauthorized");
    }

    try {
        const decoded = jwt.verify(toke, "vikas123");

        const [result]= await con.query(
            `SELECT sp.StudentId,concat(sp.FirstName," ",sp.LastName) as FullName,sp.FirstName,rd.CourseName,rd.FinalFee,sp.RegistrationDate,pd.PaymentDate,pd.PaymentAmount,pd.PaymentMode FROM student_profile sp
            JOIN registration_details rd ON rd.StudentId = sp.StudentId JOIN payment_details pd ON pd.StudentId = sp.StudentId
            WHERE sp.StudentId = ?`,[decoded.id]
        )
       return  res.send(result);
    } catch (err) {
        res.status(401).send("Invalid token");
    }
});

//Fetch Profile details
app.get("/student-details", async(req,res)=>{
    const Token = req.cookies.tokenn;

    if(!Token){
        return res.status(401).send("Unauthorized");
    }

    try{
        const decoded = jwt.verify(Token, "vikas123"); 
        const [result] = await con.query(
            `select sp.StudentId, sp.FirstName,sp.LastName,sp.Gender,sq.QId,sq.QualificationName,sp.EmailAddress,DATE_FORMAT(sp.BirthDate, '%Y-%m-%d') as BirthDate,sp.MobileNumber,
            sp.WhatsappNumber,sp.ParentName,sp.ParentNumber,sp.AadharNumber,sp.LocalAddress,sp.PermanentAddress 
            from student_profile sp join student_qualification sq 
            on sp.StudentId=sq.StudentId where sp.StudentId =?`,[decoded.id]
        )
        res.send(result)
    }catch(err){
        res.status(401).send("Invalid")
    }
})

//Update Profile details
app.put("/update-profile", async (req, res) => {
    const Token = req.cookies.tokenn;

    if (!Token) {
        return res.status(401).send("Unauthorized");
    }

    try {
        const decoded = jwt.verify(Token, "vikas123");

        const d = req.body;

        await con.query(
            `UPDATE student_profile SET FirstName = ?, LastName = ?, Gender = ?, BirthDate = ?, EmailAddress = ?, MobileNumber = ?, 
            WhatsappNumber = ?, ParentName = ?, ParentNumber = ?, AadharNumber = ?, LocalAddress = ?, PermanentAddress = ?
            WHERE StudentId = ?`,[d.fname, d.lname,d.gender,d.dob,d.email,d.mobile,d.whatsapp,d.parentName,d.parentNumber,d.aadhar,d.localAddress,d.permanentAddress, decoded.id]
        );

        res.status(200).send({ message: "Profile Updated Successfully" });

    } catch (err) {
        console.log(err);
        res.status(500).send({ message: "Update Failed" });
    }
});

//Logout
app.get("/logout", (req, res) => {
    res.clearCookie("tokenn", {
        httpOnly: true,
        sameSite: "lax",
        secure: false
    });

    res.status(200).send({ message: "Logged out" });
});

//Passqord Change
app.post("/change-password", async (req, res) => {

    const token = req.cookies.tokenn;

    if (!token) {
        res.status(401).send({ message: "Unauthorized" });
    } 
    else {
        try {
            const decoded = jwt.verify(token, "vikas123");

            const oldPassword = req.body.oldPassword;
            const newPassword = req.body.newPassword;

            const [result] = await con.query(
                "SELECT Password FROM student_profile WHERE StudentId = ?",
                [decoded.id]
            );

            if (result.length === 0) {
                res.status(404).send({ message: "User not found" });
            } 
            else {

                if (result[0].Password !== oldPassword) {
                    res.status(400).send({ message: "Old password is incorrect" });
                } 
                else {

                    await con.query(
                        "UPDATE student_profile SET Password = ? WHERE StudentId = ?",
                        [newPassword, decoded.id]
                    );

                    res.send({ message: "Password updated successfully" });
                }
            }

        } catch (err) {
            console.log(err);
            res.status(500).send({ message: "Server error" });
        }
    }
});
app.listen(PORT,function(){
    console.log(`Server started on ${PORT}`)
})