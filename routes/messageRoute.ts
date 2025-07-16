import { Router } from 'express';
import { sendMessage, getMessages, getUserAllConversations } from '../Controllers/messageController';

const router = Router();

router.post('/', (req, res) => {
    res.send(req.body);
})

router.post('/sendMessage', sendMessage);

router.post('/getMessages', getMessages);

router.get('/getUserConversations', getUserAllConversations);


export default router;