import taskModel from "../models/taskModel.js";
import userModel from "../models/userModel.js";
import { sendMail, escapeHtml } from '../services/mail.js';

const addTask = async (req, res) => {
    const { title, description } = req.body;
    const userId = req.user.id;
    const user = await userModel.find({_id: userId});
    const newTask = new taskModel({ title, description, completed: false, userId })
    newTask.save()
        .then(() => {
            // A notification failure must not turn a saved task into a failed create request.
            void sendMail({
                to: user[0].email,
                subject: "Task Added",
                text: `Task added successfully\n${title}\n${description}`,
                html: `<h1>Task added successfully</h1><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>`
            }).catch(() => console.error("Task notification email could not be submitted"))
            return (res.status(200).json({ message: "Task added successfully" }))
        })
        .catch((error) => {
            return (
                res.status(500).json({ message: error.message })
            )
        }
        )
}
const removeTask = (req, res) => {
    const { id } = req.body;
    console.log("id: ", id);
    taskModel.findByIdAndDelete(id)
        .then(() => res.status(200).json({ message: "Task deleted successfully" }))
        .catch((error) => res.status(501).json({ message: error.message }))
}

const getTask = (req, res) => {
    taskModel.find({ userId: req.user.id })
        .then((data) => res.status(200).json(data))
        .catch((error) => res.status(501).json({ message: error.message }))
}
export { addTask, getTask,removeTask }
